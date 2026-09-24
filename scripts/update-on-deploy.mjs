import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

try {
  const envText = await readFile(new URL('../.env', import.meta.url), 'utf8');
  envText.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
} catch { /* .env is optional in Railway and GitHub Actions */ }

if (!process.env.GH_PAT && !process.env.GITHUB_TOKEN) {
  console.log('No GitHub token configured; serving the committed stats snapshot.');
  process.exit(0);
}

if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
  console.log('PostgreSQL configured; the server will refresh asynchronously after it starts.');
  process.exit(0);
}

const child = spawn(process.execPath, ['scripts/update-stats.mjs'], { stdio: 'inherit', env: process.env });
const timeoutMs = Number(process.env.STATS_REFRESH_TIMEOUT_MS || (process.env.DATABASE_URL ? 900000 : 120000));
const timeout = setTimeout(() => {
  console.warn(`GitHub refresh exceeded ${Math.round(timeoutMs / 1000)} seconds; serving the last stats snapshot.`);
  child.kill();
}, timeoutMs);
child.on('error', () => { clearTimeout(timeout); process.exitCode = 0; });
child.on('exit', (code) => {
  clearTimeout(timeout);
  if (code !== 0) console.warn('GitHub refresh failed; serving the committed stats snapshot.');
  process.exitCode = 0;
});
