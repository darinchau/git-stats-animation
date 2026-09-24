import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;
try {
  const envText = await readFile(new URL('../.env', import.meta.url), 'utf8');
  envText.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
} catch { /* .env is optional in Railway and GitHub Actions */ }

const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!token) throw new Error('Set GH_PAT (a read-only GitHub token) before running the updater.');
if (!databaseUrl) throw new Error('Set DATABASE_URL to use the incremental updater.');

const API = 'https://api.github.com';
const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'git-atlas-updater' };
const windowDays = 365;
const today = new Date();
const from = new Date(today);
from.setUTCHours(0, 0, 0, 0);
from.setUTCDate(from.getUTCDate() - (windowDays - 1));

async function github(path) {
  const response = await fetch(path.startsWith('http') ? path : `${API}${path}`, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${path}`);
  return response.json();
}

async function githubGraphQL(query, variables) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`GitHub GraphQL returned ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join('; '));
  return payload.data;
}

async function paginate(path) {
  const rows = [];
  let next = path;
  while (next) {
    const response = await fetch(next.startsWith('http') ? next : `${API}${next}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${next}`);
    rows.push(...await response.json());
    const link = response.headers.get('link') || '';
    next = link.match(/<([^>]+)>; rel="next"/)?.[1] || null;
  }
  return rows;
}

async function recentBranches(repository) {
  const query = `query($owner:String!, $name:String!, $cursor:String) {
    repository(owner:$owner, name:$name) {
      refs(refPrefix:"refs/heads/", first:100, after:$cursor) {
        nodes { name target { ... on Commit { oid committedDate } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`;
  const branches = [];
  let cursor = null;
  do {
    const data = await githubGraphQL(query, { owner: repository.owner.login, name: repository.name, cursor });
    const refs = data.repository?.refs;
    if (!refs) break;
    refs.nodes.forEach((branch) => {
      if (branch.target?.oid && branch.target?.committedDate && new Date(branch.target.committedDate) >= from) branches.push(branch);
    });
    cursor = refs.pageInfo.hasNextPage ? refs.pageInfo.endCursor : null;
  } while (cursor);
  return branches;
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const query = (text, values) => pool.query(text, values);
await query(`
  CREATE TABLE IF NOT EXISTS github_repositories (
    id BIGINT PRIMARY KEY, full_name TEXT NOT NULL UNIQUE, owner_login TEXT NOT NULL, name TEXT NOT NULL,
    default_branch TEXT, pushed_at TIMESTAMPTZ, archived BOOLEAN NOT NULL DEFAULT FALSE,
    last_synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS github_commits (
    sha TEXT PRIMARY KEY, repository_id BIGINT NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
    repository TEXT NOT NULL, author_login TEXT, author_email TEXT, authored_at TIMESTAMPTZ NOT NULL,
    additions INTEGER NOT NULL DEFAULT 0, deletions INTEGER NOT NULL DEFAULT 0, is_merge BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS github_commits_authored_at_idx ON github_commits(authored_at);
  CREATE TABLE IF NOT EXISTS github_repo_languages (
    repository_id BIGINT NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
    language TEXT NOT NULL, bytes BIGINT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (repository_id, language)
  );
`);

const user = await github('/user');
const login = process.env.GH_USERNAME || user.login;
const emailSet = new Set([user.email].filter(Boolean));
try {
  const emails = await github('/user/emails');
  emails.forEach((entry) => emailSet.add(entry.email));
} catch { /* user:email is optional when author login fields are available */ }

const repositories = (await paginate('/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&visibility=all&sort=updated')).filter((repo) => !repo.archived);
const stored = new Map((await query('SELECT id, pushed_at, last_synced_at FROM github_repositories')).rows.map((row) => [String(row.id), row]));
const matchesUser = (item) => item?.login?.toLowerCase() === login.toLowerCase() || emailSet.has(item?.email);
let changedRepositories = 0;
let insertedCommits = 0;

for (const repository of repositories) {
  const repositoryId = String(repository.id);
  const previous = stored.get(repositoryId);
  const pushedAt = repository.pushed_at ? new Date(repository.pushed_at) : null;
  const previousPushedAt = previous?.pushed_at ? new Date(previous.pushed_at) : null;
  const needsSync = !previous?.last_synced_at || !previousPushedAt || (pushedAt && pushedAt > previousPushedAt);
  await query(`
    INSERT INTO github_repositories (id, full_name, owner_login, name, default_branch, pushed_at, archived, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,now())
    ON CONFLICT (id) DO UPDATE SET full_name=EXCLUDED.full_name, owner_login=EXCLUDED.owner_login,
      name=EXCLUDED.name, default_branch=EXCLUDED.default_branch, pushed_at=EXCLUDED.pushed_at,
      archived=EXCLUDED.archived, updated_at=now()
  `, [repository.id, repository.full_name, repository.owner.login, repository.name, repository.default_branch, pushedAt, repository.archived]);
  if (!needsSync) continue;
  changedRepositories += 1;

  const previousSync = previous?.last_synced_at ? new Date(previous.last_synced_at) : null;
  const syncFrom = previousSync ? new Date(previousSync.getTime() - 2 * 86400000) : from;
  const branches = await recentBranches(repository);
  const candidates = new Map();
  for (const branch of branches) {
    try {
      const path = `/repos/${repository.full_name}/commits?sha=${encodeURIComponent(branch.target.oid)}&author=${encodeURIComponent(login)}&since=${syncFrom.toISOString()}&until=${today.toISOString()}&per_page=100`;
      const items = await paginate(path);
      for (const item of items) {
        if (item.parents?.length > 1 || candidates.has(item.sha)) continue;
        const author = item.author || {};
        const commitAuthor = item.commit?.author || {};
        const committer = item.committer || {};
        const commitCommitter = item.commit?.committer || {};
        if (!matchesUser(author) && !matchesUser(committer) && !matchesUser(commitAuthor) && !matchesUser(commitCommitter)) continue;
        candidates.set(item.sha, { sha: item.sha, authoredAt: commitAuthor.date || commitCommitter.date, authorLogin: author.login || null, authorEmail: commitAuthor.email || commitCommitter.email || null });
      }
    } catch (error) {
      console.warn(`[stats] ${repository.full_name}/${branch.name}: ${error.message}`);
    }
  }

  const candidateRows = [...candidates.values()];
  const existing = candidateRows.length ? new Set((await query('SELECT sha FROM github_commits WHERE sha = ANY($1::text[])', [candidateRows.map((item) => item.sha)])).rows.map((row) => row.sha)) : new Set();
  const newCandidates = candidateRows.filter((item) => !existing.has(item.sha));
  for (let index = 0; index < newCandidates.length; index += 6) {
    const batch = newCandidates.slice(index, index + 6);
    const details = await Promise.all(batch.map(async (commit) => {
      try { return { ...commit, detail: await github(`/repos/${repository.full_name}/commits/${commit.sha}`) }; }
      catch (error) { console.warn(`[stats] ${commit.sha}: ${error.message}`); return null; }
    }));
    for (const commit of details.filter(Boolean)) {
      const authoredAt = commit.detail?.commit?.author?.date || commit.detail?.commit?.committer?.date || commit.authoredAt;
      if (!authoredAt) continue;
      await query(`
        INSERT INTO github_commits (sha, repository_id, repository, author_login, author_email, authored_at, additions, deletions, is_merge)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false) ON CONFLICT (sha) DO NOTHING
      `, [commit.sha, repository.id, repository.full_name, commit.authorLogin, commit.authorEmail, authoredAt, commit.detail?.stats?.additions || 0, commit.detail?.stats?.deletions || 0]);
      insertedCommits += 1;
    }
  }

  try {
    const languages = await github(`/repos/${repository.full_name}/languages`);
    await query('DELETE FROM github_repo_languages WHERE repository_id = $1', [repository.id]);
    for (const [language, bytes] of Object.entries(languages)) {
      if (!language.toLowerCase().includes('jupyter')) await query('INSERT INTO github_repo_languages (repository_id, language, bytes) VALUES ($1,$2,$3)', [repository.id, language, bytes]);
    }
  } catch (error) {
    console.warn(`[stats] ${repository.full_name} languages: ${error.message}`);
  }
  await query('UPDATE github_repositories SET last_synced_at = now(), updated_at = now() WHERE id = $1', [repository.id]);
  console.log(`[stats] synced ${repository.full_name}: ${branches.length} branches, ${newCandidates.length} new commits`);
}

const rows = (await query(`
  SELECT (authored_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS commits,
    SUM(additions)::int AS additions, SUM(deletions)::int AS deletions
  FROM github_commits WHERE authored_at >= $1 AND authored_at < $2 AND is_merge = false
  GROUP BY day ORDER BY day
`, [from, new Date(today.getTime() + 86400000)])).rows;
const dailyMap = new Map(rows.map((row) => [String(row.day).slice(0, 10), row]));
const dateKey = (date) => date.toISOString().slice(0, 10);
const days = Array.from({ length: windowDays }, (_, index) => {
  const date = new Date(from); date.setUTCDate(from.getUTCDate() + index);
  const row = dailyMap.get(dateKey(date));
  return { date: dateKey(date), commits: Number(row?.commits || 0), additions: Number(row?.additions || 0), deletions: Number(row?.deletions || 0) };
});
const activeDays = days.filter((day) => day.commits > 0);
const weekKeys = [...new Set(activeDays.map((day) => { const date = new Date(`${day.date}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - date.getUTCDay()); return dateKey(date); }))].sort();
let longestWeekStreak = 0;
let run = 0;
for (let index = 0; index < weekKeys.length; index += 1) {
  const current = new Date(`${weekKeys[index]}T00:00:00Z`);
  const previous = index ? new Date(`${weekKeys[index - 1]}T00:00:00Z`) : null;
  run = previous && current - previous === 604800000 ? run + 1 : 1;
  longestWeekStreak = Math.max(longestWeekStreak, run);
}
const maxDay = days.reduce((max, day) => day.commits > max.commits ? day : max, { commits: 0, date: dateKey(today) });
const hourlyRows = (await query(`SELECT EXTRACT(HOUR FROM authored_at AT TIME ZONE 'UTC')::int AS hour, COUNT(*)::int AS commits FROM github_commits WHERE authored_at >= $1 AND authored_at < $2 AND is_merge = false GROUP BY hour`, [from, new Date(today.getTime() + 86400000)])).rows;
const hourlyCommits = Array.from({ length: 24 }, () => 0);
hourlyRows.forEach((row) => { hourlyCommits[Number(row.hour)] = Number(row.commits); });
const maxHour = hourlyCommits.indexOf(Math.max(...hourlyCommits));
const languageRows = (await query('SELECT language, SUM(bytes)::bigint AS bytes FROM github_repo_languages GROUP BY language ORDER BY bytes DESC')).rows;
const totalLanguageSize = languageRows.reduce((sum, row) => sum + Number(row.bytes), 0) || 1;
const languages = languageRows.slice(0, 6).map((row) => ({ name: row.language, percentage: Number((Number(row.bytes) / totalLanguageSize * 100).toFixed(2)), loc: Number(row.bytes) }));
const number = (value) => new Intl.NumberFormat('en-US').format(value);
const formatDate = (value) => new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(value);
const total = days.reduce((sum, day) => sum + day.commits, 0);
const additions = days.reduce((sum, day) => sum + day.additions, 0);
const deletions = days.reduce((sum, day) => sum + day.deletions, 0);
const snapshot = {
  generatedAt: new Date().toISOString(), period: `${formatDate(from)} — ${formatDate(today)}`,
  summary: { totalContributions: total, longestWeekStreak, daysContributed: activeDays.length, daysPercent: `${(activeDays.length / windowDays * 100).toFixed(1)}% of the year`, streakPeriod: 'all visible branches · merges excluded' },
  languages,
  chart: { averageCommits: Number((total / windowDays).toFixed(1)), peakDay: `peak ${number(maxDay.commits)} · ${formatDate(new Date(`${maxDay.date}T00:00:00Z`))}`, additions: `${(additions / 1000).toFixed(1)}k`, deletions: `${(deletions / 1000).toFixed(1)}k`, netLines: `net ${additions - deletions >= 0 ? '+' : ''}${number(additions - deletions)} lines`, peakHour: `${String(maxHour).padStart(2, '0')}:00`, peakHourCount: `${number(hourlyCommits[maxHour])} commits` },
  daily: days, hourlyCommits,
  source: `PostgreSQL cache · ${repositories.length} visible repositories · incremental sync · merges excluded · rolling ${windowDays} days ending today · UTC`
};
await writeFile(new URL('../data/stats.json', import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`[stats] ${insertedCommits} new commits stored; ${changedRepositories}/${repositories.length} repositories synced; snapshot rebuilt from PostgreSQL.`);
await pool.end();
