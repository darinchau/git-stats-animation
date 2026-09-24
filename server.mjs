import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderStatsSvg } from './scripts/render-stats-svg.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
try {
  const envText = await readFile(join(root, '.env'), 'utf8');
  envText.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
} catch { /* .env is optional in deployed environments */ }
const port = Number(process.env.PORT || 47145);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const statsPath = join(root, 'data', 'stats.json');
let refreshInFlight = false;

async function readStats() {
  try { return JSON.parse(await readFile(statsPath, 'utf8')); } catch { return {}; }
}

function refreshStats() {
  if ((!process.env.GH_PAT && !process.env.GITHUB_TOKEN) || refreshInFlight) return;
  refreshInFlight = true;
  let child;
  try {
    child = spawn(process.execPath, ['scripts/update-stats.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  } catch {
    refreshInFlight = false;
    console.warn('[stats] refresh could not start; retaining the last snapshot');
    return;
  }
  child.stdout.on('data', (chunk) => process.stdout.write(`[stats] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[stats] ${chunk}`));
  const timeoutMs = Number(process.env.STATS_REFRESH_TIMEOUT_MS || (process.env.DATABASE_URL ? 1800000 : 120000));
  const timeout = setTimeout(() => child.kill(), timeoutMs);
  child.on('error', () => { clearTimeout(timeout); refreshInFlight = false; });
  child.on('exit', (code) => {
    clearTimeout(timeout);
    refreshInFlight = false;
    if (code !== 0) console.warn('[stats] refresh failed; retaining the last snapshot');
  });
}

const refreshEveryMs = 3 * 60 * 60 * 1000;
setTimeout(refreshStats, 1000).unref();
setInterval(refreshStats, refreshEveryMs).unref();

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (pathname === '/stats.svg' || pathname === '/stats-light.svg' || pathname === '/stats-dark.svg') {
    const snapshot = await readStats();
    response.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'Access-Control-Allow-Origin': '*' });
    const theme = pathname === '/stats-dark.svg' ? 'dark' : 'light';
    response.end(renderStatsSvg(snapshot, { theme }));
    return;
  }
  if (pathname === '/stats.json') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'Access-Control-Allow-Origin': '*' });
    response.end(JSON.stringify(await readStats()));
    return;
  }
  const safePath = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  if (!safePath.startsWith(root)) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    const body = await readFile(safePath);
    response.writeHead(200, { 'Content-Type': types[extname(safePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '0.0.0.0', () => console.log(`git atlas listening on ${port}`));
