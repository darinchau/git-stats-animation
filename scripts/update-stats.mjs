import { readFile } from 'node:fs/promises';

try {
  const envText = await readFile(new URL('../.env', import.meta.url), 'utf8');
  envText.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
} catch { /* .env is optional in CI */ }

if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
  await import('./update-stats-db.mjs');
} else {
  await import('./update-stats-full.mjs');
}
