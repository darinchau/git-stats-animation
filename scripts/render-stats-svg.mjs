const escapeXml = (value) => String(value ?? '').replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
const number = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0);
const dateLabel = (value) => new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(value);

const palettes = {
  light: { topInk: '#26343c', topMuted: '#607179', rule: '#c6d1d3', panel: '#eef3f2', panelRule: '#d2dedd', panelInk: '#193034', panelMuted: '#64777b', grid: '#dce7e4', line: '#1daa6b', area: '#1daa6b', loc: '#7861dc', locLine: '#67a83a', cell: ['#e8efed', '#c4e3d4', '#7dd5aa', '#35b879', '#168d59'], radial: '#228c60' },
  dark: { topInk: '#e6f2ec', topMuted: '#8fa49f', rule: '#3a4d50', panel: '#10191d', panelRule: '#3e5558', panelInk: '#e8f5ef', panelMuted: '#8aa09a', grid: '#223438', line: '#58e3a1', area: '#58e3a1', loc: '#9e83ff', locLine: '#b8eb72', cell: ['#17272a', '#1c4939', '#267c56', '#36b879', '#67e6a3'], radial: '#3bba7b' }
};

function sample(values, limit = 80) {
  if (values.length <= limit) return values;
  return Array.from({ length: limit }, (_, index) => {
    const start = Math.floor(index * values.length / limit);
    const end = Math.max(start + 1, Math.floor((index + 1) * values.length / limit));
    const bucket = values.slice(start, end);
    return bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
  });
}

function points(values, x, y, width, height, maxValue = Math.max(...values, 1)) {
  return sample(values).map((value, index, sampled) => `${(x + (index / Math.max(sampled.length - 1, 1)) * width).toFixed(1)},${(y + height - ((value || 0) / maxValue) * height).toFixed(1)}`);
}

function pathFromPoints(pointString) { return `M${pointString.join(' L')}`; }

function mixColor(start, end, amount) {
  const parse = (value) => value.match(/[\da-f]{2}/gi).map((part) => parseInt(part, 16));
  const a = parse(start); const b = parse(end);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

export function renderStatsSvg(snapshot = {}, { theme = 'light' } = {}) {
  const palette = palettes[theme] || palettes.light;
  const summary = snapshot.summary || {};
  const languages = (snapshot.languages || []).slice(0, 6);
  const fallbackDaily = Array.from({ length: 365 }, (_, index) => {
    const active = ((index * 37) % 365) < 202;
    const commits = active ? 28 + ((index * 23) % 56) : 0;
    return { date: '', commits, additions: commits * (18 + ((index * 11) % 44)), deletions: commits * (7 + ((index * 17) % 21)) };
  });
  const daily = Array.isArray(snapshot.daily) && snapshot.daily.length ? snapshot.daily : fallbackDaily;
  const commits = daily.map((day) => Number(day.commits) || 0);
  const additions = daily.map((day) => Number(day.additions) || 0);
  const deletions = daily.map((day) => Number(day.deletions) || 0);
  const hourly = Array.isArray(snapshot.hourlyCommits) && snapshot.hourlyCommits.length === 24 ? snapshot.hourlyCommits.map(Number) : Array.from({ length: 24 }, () => 0);
  const maxCommit = Math.max(...commits, 1);
  const locTotals = additions.map((value, index) => value + deletions[index]);
  const locMax = Math.max(...locTotals, 1);
  const languageColors = ['#55d99a', '#8d73ff', '#a8e869', '#5ec5e8', '#f1a35b', '#5b96d4'];
  const languageTotal = languages.reduce((sum, language) => sum + Number(language.percentage || 0), 0) || 1;
  const languageBar = languages.reduce((output, language, index) => {
    const x = 700 + languages.slice(0, index).reduce((sum, item) => sum + Number(item.percentage || 0) / languageTotal * 460, 0);
    const width = Number(language.percentage || 0) / languageTotal * 460;
    return `${output}<rect x="${x.toFixed(1)}" y="94" width="${width.toFixed(1)}" height="9" fill="${languageColors[index]}"/>`;
  }, '');
  const languageRows = languages.map((language, index) => {
    const x = index % 2 === 0 ? 700 : 930;
    const y = 134 + Math.floor(index / 2) * 30;
    return `<circle cx="${x}" cy="${y - 4}" r="4" fill="${languageColors[index]}"/><text x="${x + 13}" y="${y}" class="top-label">${escapeXml(language.name)}</text><text x="${x + 13}" y="${y + 13}" class="top-muted small">${Number(language.percentage || 0).toFixed(2)}% · ${number(language.loc)} LoC</text>`;
  }).join('');

  const gridMax = Math.max(...commits, 1);
  const gridCells = Array.from({ length: 364 }, (_, index) => {
    const value = commits[index] || 0;
    const ratio = value / gridMax;
    const fill = value === 0 ? palette.cell[0] : mixColor(palette.cell[1], palette.cell[4], Math.max(.12, ratio));
    const x = 64 + Math.floor(index / 7) * 9.85;
    const y = 303 + (index % 7) * 14;
    return `<rect class="activity-cell" style="--delay:${(index % 36) * -90}ms" x="${x.toFixed(1)}" y="${y}" width="7" height="8" rx="1.5" fill="${fill}"/>`;
  }).join('');

  const commitLine = points(commits, 64, 529, 518, 103, maxCommit);
  const locTop = points(locTotals, 664, 529, 472, 103, locMax);
  const locBase = points(deletions, 664, 529, 472, 103, locMax);
  const hourlyMax = Math.max(...hourly, 1);
  const radialBars = hourly.map((value, index) => {
    const angle = index * 15 - 90;
    const radians = angle * Math.PI / 180;
    const inner = 57;
    const outer = inner + 12 + (value / hourlyMax) * 38;
    const x1 = 900 + Math.cos(radians) * inner;
    const y1 = 320 + Math.sin(radians) * inner;
    const x2 = 900 + Math.cos(radians) * outer;
    const y2 = 320 + Math.sin(radians) * outer;
    return `<line class="radial-bar" style="--delay:${index * 70}ms" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${mixColor(palette.radial, '#b8eb72', value / hourlyMax)}" stroke-width="4" stroke-linecap="round"/>`;
  }).join('');
  const latestDate = daily.at(-1)?.date ? dateLabel(new Date(`${daily.at(-1).date}T00:00:00Z`)) : '';
  const firstDate = daily[0]?.date ? dateLabel(new Date(`${daily[0].date}T00:00:00Z`)) : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="740" viewBox="0 0 1200 740" role="img" aria-labelledby="title desc">
  <title id="title">Activity</title><desc id="desc">Git contribution activity across the last year.</desc>
  <style>
    .top-ink{fill:${palette.topInk};font-family:ui-sans-serif,system-ui,sans-serif}.top-muted{fill:${palette.topMuted};font-family:monospace}.top-label{fill:${palette.topInk};font:13px monospace}.small{font-size:10px}.top-rule{stroke:${palette.rule};stroke-width:1}.panel{fill:${palette.panel};stroke:${palette.panelRule};stroke-width:1}.panel-title{fill:${palette.panelInk};font:600 13px ui-sans-serif,system-ui,sans-serif;letter-spacing:1.4px}.grid-line{stroke:${palette.grid};stroke-width:1}.axis{fill:${palette.panelMuted};font:10px monospace}.metric{fill:${palette.topInk};font:500 36px ui-sans-serif,system-ui,sans-serif;letter-spacing:-1.5px}.chart-line{fill:none;stroke:${palette.line};stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.chart-area{fill:${palette.area};fill-opacity:.15}.loc-line{fill:none;stroke:${palette.locLine};stroke-width:2.5;stroke-linejoin:round}.loc-area{fill:${palette.loc};fill-opacity:.2}.loc-top{fill:${palette.locLine};fill-opacity:.17}.activity-cell{animation:cell-pulse 5.2s ease-in-out var(--delay) infinite}.radial-bar{animation:bar-pulse 3.6s ease-in-out var(--delay) infinite alternate;transform-box:fill-box;transform-origin:center}.anim-line{stroke-dasharray:1;stroke-dashoffset:1;animation:line-draw 2.4s cubic-bezier(.16,1,.3,1) .15s forwards}.anim-area{animation:area-in 1.2s ease-out .2s both}.ring-pulse{animation:ring-pulse 3.8s ease-in-out infinite}
    @keyframes cell-pulse{0%,100%{opacity:.72}50%{opacity:1}}@keyframes bar-pulse{0%{opacity:.65}100%{opacity:1;transform:scale(1.06)}}@keyframes line-draw{to{stroke-dashoffset:0}}@keyframes area-in{from{opacity:0}to{opacity:.15}}@keyframes ring-pulse{0%,100%{opacity:.55}50%{opacity:1}}
    @media (prefers-reduced-motion:reduce){.activity-cell,.radial-bar,.anim-line,.anim-area,.ring-pulse{animation:none!important;stroke-dashoffset:0!important}}
  </style>
  <text x="40" y="34" class="top-ink" style="font:600 22px ui-sans-serif,system-ui,sans-serif">Activity</text><line x1="40" y1="58" x2="1160" y2="58" class="top-rule"/>
  <text x="40" y="91" class="top-muted small">TOTAL CONTRIBUTIONS</text><text x="40" y="130" class="metric">${number(summary.totalContributions ?? 0)}</text><text x="40" y="151" class="top-muted small">${escapeXml(snapshot.period || '')}</text>
  <line x1="230" y1="78" x2="230" y2="170" class="top-rule"/><text x="258" y="91" class="top-muted small">LONGEST WEEK STREAK</text><text x="258" y="130" class="metric">${number(summary.longestWeekStreak ?? 0)} <tspan class="top-muted small">weeks</tspan></text><text x="258" y="151" class="top-muted small">${escapeXml(summary.streakPeriod || '')}</text>
  <line x1="475" y1="78" x2="475" y2="170" class="top-rule"/><text x="503" y="91" class="top-muted small">DAYS CONTRIBUTED</text><text x="503" y="130" class="metric">${number(summary.daysContributed ?? 0)}</text><text x="503" y="151" class="top-muted small">${escapeXml(summary.daysPercent || '')}</text>
  <line x1="660" y1="74" x2="660" y2="174" class="top-rule"/><text x="700" y="78" class="top-ink" style="font:600 15px ui-sans-serif,system-ui,sans-serif">Most used languages</text>${languageBar}${languageRows}

  <rect x="40" y="220" width="570" height="205" rx="4" class="panel"/><text x="64" y="252" class="panel-title">CONTRIBUTION FIELD</text>${gridCells}
  <rect x="630" y="220" width="530" height="205" rx="4" class="panel"/><text x="654" y="252" class="panel-title">TIME OF DAY</text><circle cx="900" cy="320" r="85" fill="none" stroke="${palette.panelRule}" class="ring-pulse"/><circle cx="900" cy="320" r="59" fill="none" stroke="${palette.grid}"/>${radialBars}<circle cx="900" cy="320" r="5" fill="${palette.line}"/><text x="900" y="242" text-anchor="middle" class="axis">00:00</text><text x="1006" y="324" class="axis">06:00</text><text x="900" y="414" text-anchor="middle" class="axis">12:00</text><text x="794" y="324" text-anchor="end" class="axis">18:00</text>
  <rect x="40" y="440" width="570" height="260" rx="4" class="panel"/><text x="64" y="472" class="panel-title">COMMITS / DAY</text><line x1="64" y1="502" x2="586" y2="502" class="grid-line"/><line x1="64" y1="534" x2="586" y2="534" class="grid-line"/><line x1="64" y1="566" x2="586" y2="566" class="grid-line"/><line x1="64" y1="598" x2="586" y2="598" class="grid-line"/><path d="${pathFromPoints(commitLine)} L582,598 L64,598 Z" class="chart-area anim-area"/><path pathLength="1" d="${pathFromPoints(commitLine)}" class="chart-line anim-line"/><text x="64" y="632" class="axis">${escapeXml(firstDate)}</text><text x="586" y="632" text-anchor="end" class="axis">${escapeXml(latestDate)}</text>
  <rect x="630" y="440" width="530" height="260" rx="4" class="panel"/><text x="654" y="472" class="panel-title">LINES OF CODE / DAY</text><line x1="654" y1="502" x2="1136" y2="502" class="grid-line"/><line x1="654" y1="534" x2="1136" y2="534" class="grid-line"/><line x1="654" y1="566" x2="1136" y2="566" class="grid-line"/><line x1="654" y1="598" x2="1136" y2="598" class="grid-line"/><path d="${pathFromPoints(locBase)} L1136,598 L664,598 Z" class="loc-area anim-area"/><path d="${pathFromPoints(locTop)} ${locBase.slice().reverse().map((point) => `L${point}`).join(' ')} Z" class="loc-top anim-area"/><path pathLength="1" d="${pathFromPoints(locTop)}" class="loc-line anim-line"/><text x="654" y="632" class="axis">${escapeXml(firstDate)}</text><text x="1136" y="632" text-anchor="end" class="axis">${escapeXml(latestDate)}</text>
</svg>`;
}
