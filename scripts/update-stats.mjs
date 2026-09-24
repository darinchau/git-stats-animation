import { mkdir, writeFile } from 'node:fs/promises';

const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
if (!token) throw new Error('Set GH_PAT (a read-only GitHub token) before running the updater.');

const API = 'https://api.github.com';
const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'git-atlas-updater' };
const today = new Date();
const from = new Date(today);
from.setUTCHours(0, 0, 0, 0);
from.setUTCDate(from.getUTCDate() - 364);

async function github(path) {
  const response = await fetch(path.startsWith('http') ? path : `${API}${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${path}`);
  return response.json();
}

async function paginate(path) {
  const rows = [];
  let next = path;
  while (next) {
    const response = await fetch(next.startsWith('http') ? next : `${API}${next}`, { headers });
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

const repositories = (await paginate('/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&visibility=all&sort=updated')).filter((repo) => !repo.archived);
const commits = new Map();
const matchesUser = (item) => item?.login?.toLowerCase() === login.toLowerCase() || emailSet.has(item?.email);

for (const repository of repositories) {
  const branches = await paginate(`/repos/${repository.full_name}/branches?per_page=100`);
  for (const branch of branches) {
    const branchCommits = await paginate(`/repos/${repository.full_name}/commits?sha=${encodeURIComponent(branch.name)}&since=${from.toISOString()}&until=${today.toISOString()}&per_page=100`);
    for (const item of branchCommits) {
      if (commits.has(item.sha) || item.parents?.length > 1) continue;
      const author = item.author || {};
      const commitAuthor = item.commit?.author || {};
      const committer = item.committer || {};
      const commitCommitter = item.commit?.committer || {};
      if (!matchesUser(author) && !matchesUser(committer) && !matchesUser(commitAuthor) && !matchesUser(commitCommitter)) continue;
      commits.set(item.sha, { sha: item.sha, repository: repository.full_name, date: commitAuthor.date || commitCommitter.date || item.commit?.author?.date });
    }
  }
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
for (let index = 0; index < 365; index += 1) {
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
  summary: { totalContributions: details.length, longestWeekStreak, daysContributed: activeDays.length, daysPercent: `${(activeDays.length / 365 * 100).toFixed(1)}% of the year`, streakPeriod: 'all visible branches · merges excluded' },
  languages,
  chart: { averageCommits: average, peakDay: `peak ${number(maxDay.commits)} · ${formatDate(new Date(`${maxDay.date}T00:00:00Z`))}`, additions: `${(additions / 1000).toFixed(1)}k`, deletions: `${(deletions / 1000).toFixed(1)}k`, netLines: `net +${number(additions - deletions)} lines`, peakHour: `${String(maxHour).padStart(2, '0')}:00`, peakHourCount: `${number(hourlyCommits[maxHour])} commits` },
  daily: days,
  hourlyCommits,
  source: 'GitHub REST · all visible branches · SHA-deduped · merge commits excluded · UTC'
};
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/stats.json', import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Updated ${details.length} commits across ${repositories.length} repositories for ${login}.`);
