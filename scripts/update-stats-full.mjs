import { mkdir, readFile, writeFile } from 'node:fs/promises';

try {
  const envText = await readFile(new URL('../.env', import.meta.url), 'utf8');
  envText.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
} catch { /* .env is optional in GitHub Actions */ }

const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
if (!token) throw new Error('Set GH_PAT (a read-only GitHub token) before running the updater.');

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
  const seenTips = new Set();
  let cursor = null;
  do {
    const data = await githubGraphQL(query, { owner: repository.owner.login, name: repository.name, cursor });
    const refs = data.repository?.refs;
    if (!refs) break;
    refs.nodes.forEach((branch) => {
      if (!branch.target?.oid || !branch.target?.committedDate || new Date(branch.target.committedDate) < from || seenTips.has(branch.target.oid)) return;
      seenTips.add(branch.target.oid);
      branches.push(branch);
    });
    cursor = refs.pageInfo.hasNextPage ? refs.pageInfo.endCursor : null;
  } while (cursor);
  return branches;
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

const user = await github('/user');
const login = process.env.GH_USERNAME || user.login;
let emailSet = new Set([user.email].filter(Boolean));
try {
  const emails = await github('/user/emails');
  emails.forEach((entry) => emailSet.add(entry.email));
} catch { /* user:email is optional when author login fields are available */ }

const repositories = await paginate('/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&visibility=all&sort=updated');
const commits = new Map();
const matchesUser = (item) => item?.login?.toLowerCase() === login.toLowerCase() || emailSet.has(item?.email);

const repositoryBatches = [];
for (let index = 0; index < repositories.length; index += 12) repositoryBatches.push(repositories.slice(index, index + 12));
const branchJobs = [];
let repositoriesEnumerated = 0;
for (const batch of repositoryBatches) {
  const results = await Promise.all(batch.map(async (repository) => {
    try { return { repository, branches: await recentBranches(repository) }; }
    catch { return { repository, branches: [] }; }
  }));
  results.forEach(({ repository, branches }) => branches.forEach((branch) => branchJobs.push({ repository, branch })));
  repositoriesEnumerated += batch.length;
  console.log(`Enumerated ${repositoriesEnumerated}/${repositories.length} repositories; ${branchJobs.length} branches queued.`);
}
for (let index = 0; index < branchJobs.length; index += 12) {
  const batch = branchJobs.slice(index, index + 12);
  const results = await Promise.all(batch.map(async ({ repository, branch }) => {
    try {
      // Ask GitHub to filter by the authenticated author before pagination.
      const path = `/repos/${repository.full_name}/commits?sha=${encodeURIComponent(branch.target?.oid || branch.name)}&author=${encodeURIComponent(login)}&since=${from.toISOString()}&until=${today.toISOString()}&per_page=100`;
      return { repository, items: await paginate(path) };
    } catch { return { repository, items: [] }; }
  }));
  results.forEach(({ repository, items }) => items.forEach((item) => {
    if (commits.has(item.sha) || item.parents?.length > 1) return;
    const author = item.author || {};
    const commitAuthor = item.commit?.author || {};
    const committer = item.committer || {};
    const commitCommitter = item.commit?.committer || {};
    if (!matchesUser(author) && !matchesUser(committer) && !matchesUser(commitAuthor) && !matchesUser(commitCommitter)) return;
    commits.set(item.sha, { sha: item.sha, repository: repository.full_name, date: commitAuthor.date || commitCommitter.date || item.commit?.author?.date });
  }));
  if ((index + 12) % 120 === 0 || index + 12 >= branchJobs.length) console.log(`Scanned ${Math.min(index + 12, branchJobs.length)}/${branchJobs.length} branches; ${commits.size} authored commits found.`);
}

const details = [];
const entries = [...commits.values()];
for (let index = 0; index < entries.length; index += 6) {
  const batch = entries.slice(index, index + 6);
  details.push(...await Promise.all(batch.map(async (commit) => {
    try { return { ...commit, detail: await github(`/repos/${commit.repository}/commits/${commit.sha}`) }; } catch { return { ...commit, detail: null }; }
  })));
}

const dateKey = (date) => date.toISOString().slice(0, 10);
const dailyCommits = new Map();
const dailyAdditions = new Map();
const dailyDeletions = new Map();
const hourlyCommits = Array.from({ length: 24 }, () => 0);
for (const commit of details) {
  const date = new Date(commit.detail?.commit?.author?.date || commit.date);
  if (Number.isNaN(date.valueOf())) continue;
  const key = dateKey(date);
  dailyCommits.set(key, (dailyCommits.get(key) || 0) + 1);
  dailyAdditions.set(key, (dailyAdditions.get(key) || 0) + (commit.detail?.stats?.additions || 0));
  dailyDeletions.set(key, (dailyDeletions.get(key) || 0) + (commit.detail?.stats?.deletions || 0));
  hourlyCommits[date.getUTCHours()] += 1;
}

const days = [];
for (let index = 0; index < windowDays; index += 1) {
  const date = new Date(from);
  date.setUTCDate(from.getUTCDate() + index);
  const key = dateKey(date);
  days.push({ date: key, commits: dailyCommits.get(key) || 0, additions: dailyAdditions.get(key) || 0, deletions: dailyDeletions.get(key) || 0 });
}
const activeDays = days.filter((day) => day.commits > 0);
const maxDay = days.reduce((max, day) => day.commits > max.commits ? day : max, { commits: 0, date: dateKey(today) });
const maxHour = hourlyCommits.indexOf(Math.max(...hourlyCommits));
const weekKeys = [...new Set(activeDays.map((day) => { const date = new Date(`${day.date}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - date.getUTCDay()); return dateKey(date); }))].sort();
let longestWeekStreak = 0;
let run = 0;
for (let index = 0; index < weekKeys.length; index += 1) {
  const current = new Date(`${weekKeys[index]}T00:00:00Z`);
  const previous = index ? new Date(`${weekKeys[index - 1]}T00:00:00Z`) : null;
  run = previous && (current - previous) === 604800000 ? run + 1 : 1;
  longestWeekStreak = Math.max(longestWeekStreak, run);
}

const languageSizes = new Map();
for (let index = 0; index < repositories.length; index += 8) {
  const batch = repositories.slice(index, index + 8);
  const languageResults = await Promise.all(batch.map(async (repo) => {
    try { return await github(`/repos/${repo.full_name}/languages`); } catch { return {}; }
  }));
  languageResults.forEach((languages) => Object.entries(languages).forEach(([name, size]) => {
    if (!name.toLowerCase().includes('jupyter')) languageSizes.set(name, (languageSizes.get(name) || 0) + size);
  }));
}
const totalLanguageSize = [...languageSizes.values()].reduce((sum, size) => sum + size, 0) || 1;
const languages = [...languageSizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, size]) => ({ name, percentage: Number((size / totalLanguageSize * 100).toFixed(2)), loc: size }));
const number = (value) => new Intl.NumberFormat('en-US').format(value);
const formatDate = (value) => new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(value);
const average = Number((details.length / 365).toFixed(1));
const additions = days.reduce((sum, day) => sum + day.additions, 0);
const deletions = days.reduce((sum, day) => sum + day.deletions, 0);

const snapshot = {
  generatedAt: new Date().toISOString(),
  period: `${formatDate(from)} — ${formatDate(today)}`,
  summary: { totalContributions: details.length, longestWeekStreak, daysContributed: activeDays.length, daysPercent: `${(activeDays.length / windowDays * 100).toFixed(1)}% of the year`, streakPeriod: 'all visible branches · merges excluded' },
  languages,
  chart: { averageCommits: average, peakDay: `peak ${number(maxDay.commits)} · ${formatDate(new Date(`${maxDay.date}T00:00:00Z`))}`, additions: `${(additions / 1000).toFixed(1)}k`, deletions: `${(deletions / 1000).toFixed(1)}k`, netLines: `net +${number(additions - deletions)} lines`, peakHour: `${String(maxHour).padStart(2, '0')}:00`, peakHourCount: `${number(hourlyCommits[maxHour])} commits` },
  daily: days,
  hourlyCommits,
  source: `GitHub REST · all accessible repositories and branches · SHA-deduped · merge commits excluded · rolling ${windowDays} days ending today · UTC`
};
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/stats.json', import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Updated ${details.length} commits across ${repositories.length} repositories for ${login}.`);
