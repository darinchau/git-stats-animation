const xml = (value) => String(value ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const count = (value) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const number = (value) => new Intl.NumberFormat('en-US').format(count(value));
const short = (value) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(count(value));
const fixed = (value) => Number(value).toFixed(2);

const palettes = {
  light: { ink: '#203b35', muted: '#546d64', rule: '#d7e2dd', surface: '#f5f8f6', grid: '#e1e9e4', empty: '#e2eae5', signal: '#147d4b', highlight: '#24ac6b', deletion: '#7955bd', cell1: '#b1d8be', cell2: '#78ba8f', cell3: '#3f9662', cell4: '#197943' },
  dark: { ink: '#e6f1e9', muted: '#9bb0a4', rule: '#2e4036', surface: '#111c17', grid: '#23352a', empty: '#213229', signal: '#72dfa1', highlight: '#b7f6cf', deletion: '#b699ec', cell1: '#274e37', cell2: '#32794b', cell3: '#4aab6b', cell4: '#79dda1' }
};
const languageColors = {
  python: '#3572A5',
  typescript: '#3178C6',
  javascript: '#F1E05A',
  html: '#E34C26',
  rust: '#DEA584',
  tex: '#3D6117',
  'c++': '#F34B7D',
  go: '#00ADD8',
  css: '#663399',
  shell: '#89E051',
  java: '#B07219',
  'c#': '#178600'
};
const fallbackLanguageColors = ['#3572A5', '#3178C6', '#F1E05A', '#E34C26', '#DEA584', '#3D6117'];
const languageColor = (name, index = 0) => languageColors[String(name || '').trim().toLowerCase()] || fallbackLanguageColors[index % fallbackLanguageColors.length];
const columnMajor = (items, columns = 2) => {
  const rows = Math.max(1, Math.ceil(items.length / columns));
  return Array.from({ length: columns }, (_, column) => Array.from({ length: rows }, (_, row) => items[row * columns + column]).filter(Boolean)).flat();
};
const variables = (palette) => Object.entries(palette).map(([key, value]) => `--${key}:${value}`).join(';');
const text = (x, y, value, cls = 'label', extra = '') => `<text x="${x}" y="${y}" class="${cls}" ${extra}>${xml(value)}</text>`;
const linePath = (points) => points.map(([x, y], index) => `${index ? 'L' : 'M'}${fixed(x)},${fixed(y)}`).join(' ');
const areaPath = (points, base) => `${linePath(points)} L${fixed(points.at(-1)[0])},${base} L${fixed(points[0][0])},${base} Z`;
const stackedPath = (top, bottom) => `${linePath(top)} ${[...bottom].reverse().map(([x, y]) => `L${fixed(x)},${fixed(y)}`).join(' ')} Z`;

function plotPoints(values, x, y, width, height, max) {
  const sampled = values.length <= 96 ? values : Array.from({ length: 96 }, (_, index) => {
    const start = Math.floor(index * values.length / 96);
    const end = Math.max(start + 1, Math.floor((index + 1) * values.length / 96));
    return values.slice(start, end).reduce((sum, value) => sum + count(value), 0) / (end - start);
  });
  return sampled.map((value, index) => [x + index / Math.max(1, sampled.length - 1) * width, y + height - count(value) / max * height]);
}

function frame(x, y, width, height, title) {
  return `<rect class="panel" x="${x}" y="${y}" width="${width}" height="${height}" rx="12"/>${text(x + 24, y + 33, title, 'panel-title')}`;
}

function monthTicks(daily, x, y, width, sparse = false) {
  const months = daily.flatMap((day, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date || '') || (i && daily[i - 1].date.slice(0, 7) === day.date.slice(0, 7))) return [];
    return [{ i, label: new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(new Date(`${day.date}T00:00:00Z`)) }];
  });
  return months.filter((_, i) => !sparse || i % 3 === 0).map(({ i, label }) => text(x + i / Math.max(daily.length - 1, 1) * (width - 20), y, label, 'axis')).join('');
}

function graph(daily, id, x, values, lower = null) {
  const y = 518, width = 470, height = 112, base = y + height;
  const max = Math.max(1, ...values);
  const points = plotPoints(values, x, y, width, height, max);
  const bottom = lower ? plotPoints(lower, x, y, width, height, max) : null;
  const grid = [0, .5, 1].map((t) => `<line x1="${x}" y1="${y + height * t}" x2="${x + width}" y2="${y + height * t}" class="grid"/>${text(x - 10, y + height * t + 4, short(max * (1 - t)), 'axis', 'text-anchor="end"')}`).join('');
  const d = linePath(points);
  return `${grid}<g clip-path="url(#${id}-clip)">
    ${bottom ? `<path d="${areaPath(bottom, base)}" class="deletion-area"/><path d="${stackedPath(points, bottom)}" class="addition-area"/><path d="${linePath(bottom)}" class="deletion-line"/>` : `<path d="${areaPath(points, base)}" class="commit-area"/>`}
    <path d="${d}" class="data-line"/>
    <g mask="url(#${id}-sweep)"><path d="${d}" class="trace"/></g>
  </g>${monthTicks(daily, x, 653, width, true)}`;
}

function polar(cx, cy, radius, degrees) {
  const angle = (degrees - 90) * Math.PI / 180;
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}
function sector(cx, cy, inner, outer, from, to) {
  const a = polar(cx, cy, outer, from), b = polar(cx, cy, outer, to);
  const c = polar(cx, cy, inner, to), d = polar(cx, cy, inner, from);
  return `M${a.map(fixed)} A${outer},${outer} 0 0 0 ${b.map(fixed)} L${c.map(fixed)} A${inner},${inner} 0 0 1 ${d.map(fixed)} Z`;
}

export function renderStatsSvg(snapshot = {}, { theme = 'auto' } = {}) {
  const forced = theme === 'light' || theme === 'dark';
  const summary = snapshot.summary || {};
  // Existing preview snapshots contain summary values only. Preview geometry is kept
  // separate from real daily arrays, and identified in the accessible description.
  const preview = !Array.isArray(snapshot.daily) || !snapshot.daily.length;
  const daily = preview ? Array.from({ length: 365 }, (_, i) => {
    const commits = ((i * 37) % 365) < 202 ? 28 + ((i * 23) % 56) : 0;
    return { commits, additions: commits * (18 + ((i * 11) % 44)), deletions: commits * (7 + ((i * 17) % 21)) };
  }) : snapshot.daily;
  const commits = daily.map((day) => count(day.commits));
  const deletions = daily.map((day) => count(day.deletions));
  const totals = daily.map((day, i) => count(day.additions) + deletions[i]);
  const fallbackHourly = [2, 1, 1, 2, 3, 5, 8, 12, 15, 18, 21, 24, 22, 18, 16, 14, 13, 16, 20, 29, 38, 46, 52, 28];
  const hourly = Array.isArray(snapshot.hourlyCommits) && snapshot.hourlyCommits.length === 24
    ? snapshot.hourlyCommits.map(count)
    : fallbackHourly;
  const languages = (snapshot.languages || []).filter((lang) => !/jupyter/i.test(lang.name)).slice(0, 6);
  const langTotal = Math.max(100, languages.reduce((sum, lang) => sum + count(lang.percentage), 0));
  let langX = 684;
  const bar = languages.map((lang, i) => {
    const width = count(lang.percentage) / langTotal * 476;
    const rect = `<rect x="${fixed(langX)}" y="111" width="${fixed(width)}" height="7" fill="${languageColor(lang.name, i)}"/>`;
    langX += width;
    return rect;
  }).join('');
  const languageLayout = columnMajor(languages);
  const languageRows = languageLayout.map((lang, i) => {
    const rows = Math.max(1, Math.ceil(languageLayout.length / 2));
    const x = 684 + Math.floor(i / rows) * 246, y = 145 + (i % rows) * 35;
    return `<circle cx="${x + 3}" cy="${y - 4}" r="3.5" fill="${languageColor(lang.name, i)}"/>${text(x + 15, y, lang.name, 'language')}${text(x + 226, y, `${count(lang.percentage).toFixed(1)}%`, 'measure', 'text-anchor="end"')}${text(x + 15, y + 15, `${number(lang.loc)} LoC`, 'axis')}`;
  }).join('');

  const offset = daily[0]?.date ? new Date(`${daily[0].date}T00:00:00Z`).getUTCDay() : 0;
  const columns = Math.ceil((daily.length + offset) / 7);
  const step = 636 / columns;
  const maxCommit = Math.max(1, ...commits);
  const cells = daily.map((day, i) => {
    const value = count(day.commits), slot = i + offset;
    const level = value ? Math.max(1, Math.ceil(Math.sqrt(value / maxCommit) * 4)) : 0;
    return `<rect x="${fixed(66 + Math.floor(slot / 7) * step)}" y="${309 + slot % 7 * 14}" width="${fixed(Math.min(step - 3, 10))}" height="10" rx="2" class="cell cell-${level}"><title>${xml(day.date || '')}${day.date ? ': ' : ''}${number(value)} commits</title></rect>`;
  }).join('');

  // Each bin is centred on its hour; increasing hours run counterclockwise.
  // Subdividing the ring interpolates colour at the bin boundaries without filters.
  const maxHour = Math.max(1, ...hourly), cx = 966, cy = 349;
  const ring = hourly.map((value, hour) => {
    const start = 7.5 - hour * 15;
    const pieces = Array.from({ length: 10 }, (_, j) => {
      const position = (j + .5) / 10 - .5;
      const neighbour = hourly[(hour + (position < 0 ? 23 : 1)) % 24];
      const blend = (value * (1 - Math.abs(position)) + neighbour * Math.abs(position)) / maxHour;
      return `<path d="${sector(cx, cy, 45, 69, start - j * 1.5 - .05, start - (j + 1) * 1.5 - .08)}" class="hour-colour" opacity="${fixed(.1 + .9 * Math.sqrt(blend))}"/>`;
    }).join('');
    const a = polar(cx, cy, 73, -hour * 15), b = polar(cx, cy, hour % 6 === 0 ? 79 : 76, -hour * 15);
    return `<g data-hour="${hour}"><path d="${sector(cx, cy, 45, 69, start, start - 15)}" class="hour-base"/>${pieces}<path d="M${a.map(fixed)} L${b.map(fixed)}" class="clock-tick"/></g>`;
  }).join('');
  const mask = (id, x, y, w, h) => `<mask id="${id}-sweep" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><rect class="sweep" style="--travel:${w + 110}px" x="${x - 110}" y="${y}" width="110" height="${h}" fill="url(#beam)"/></mask>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="690" viewBox="0 0 1200 690" role="img" aria-labelledby="title desc" data-theme="${forced ? theme : 'auto'}">
<title id="title">Activity</title><desc id="desc">${preview ? 'Sample preview; detailed activity is not available in this snapshot.' : 'Daily commits, code changes and commit times over the past year.'}</desc>
<style>
  :root{${variables(palettes[forced ? theme : 'light'])}}
  ${forced ? '' : `@media(prefers-color-scheme:dark){:root{${variables(palettes.dark)}}}`}
  text{font-family:'Segoe UI',Helvetica,sans-serif;fill:var(--ink);font-variant-numeric:tabular-nums}
  .heading{font-size:26px;font-weight:600;letter-spacing:-.6px}.label{font-size:12px;fill:var(--muted)}
  .metric{font-size:42px;font-weight:600;letter-spacing:-1.1px}.unit{font-size:14px;letter-spacing:0;fill:var(--muted);font-weight:400}
  .language{font-size:13px}.measure{font-size:12px;fill:var(--muted)}.axis{font-size:11px;fill:var(--muted)}
  .panel-title{font-size:15px;font-weight:600}.rule{stroke:var(--rule);stroke-width:1}.panel{fill:var(--surface);stroke:var(--rule);stroke-width:1}
  .grid{stroke:var(--grid);stroke-width:1}.cell-0,.hour-base{fill:var(--empty)}.cell-1{fill:var(--cell1)}.cell-2{fill:var(--cell2)}.cell-3{fill:var(--cell3)}.cell-4{fill:var(--cell4)}
  .data-line,.trace,.deletion-line{fill:none;stroke:var(--signal);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  .trace{stroke:var(--highlight);stroke-width:3}.commit-area{fill:var(--signal);fill-opacity:.1}.addition-area{fill:var(--signal);fill-opacity:.16}.deletion-area{fill:var(--deletion);fill-opacity:.3}.deletion-line{stroke:var(--deletion);stroke-width:1}
  .hour-colour{fill:var(--signal)}.clock-tick{stroke:var(--muted);stroke-width:1}.orbit{fill:none;stroke:var(--signal);stroke-width:1.5;stroke-linecap:round;transform-origin:966px 349px;animation:orbit 14s linear infinite}
  .sweep{animation:sweep 14s cubic-bezier(.4,0,.2,1) infinite}.field-light{fill:var(--highlight);opacity:.45}
  @keyframes sweep{0%{transform:translateX(0)}60%,100%{transform:translateX(var(--travel))}}
  @keyframes orbit{0%{transform:rotate(0deg);opacity:.3}60%{transform:rotate(-360deg);opacity:.8}100%{transform:rotate(-360deg);opacity:.3}}
  @media(prefers-reduced-motion:reduce){.sweep,.orbit{animation:none}.sweep,.orbit{display:none}}
</style>
<defs>
  <linearGradient id="beam"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".7" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>
  <clipPath id="language-clip"><rect x="684" y="111" width="476" height="7" rx="3.5"/></clipPath>
  <clipPath id="commits-clip"><rect x="94" y="516" width="474" height="116"/></clipPath>
  <clipPath id="loc-clip"><rect x="662" y="516" width="474" height="116"/></clipPath>
  ${mask('commits', 94, 516, 474, 116)}${mask('loc', 662, 516, 474, 116)}${mask('field', 66, 307, 638, 98)}
</defs>
${text(40, 45, 'Activity', 'heading')}<path d="M40,65 H1160" class="rule"/>
${text(40, 102, 'Total contributions')}${text(40, 156, number(summary.totalContributions), 'metric')}${text(40, 184, snapshot.period || '', 'axis')}
<path d="M226,94 V193 M435,94 V193 M648,90 V213" class="rule"/>
${text(247, 102, 'Longest week streak')}<text x="247" y="156" class="metric">${number(summary.longestWeekStreak)}<tspan class="unit" dx="7">weeks</tspan></text>
${text(456, 102, 'Days contributed')}${text(456, 156, number(summary.daysContributed), 'metric')}${text(456, 184, summary.daysPercent || '', 'axis')}
${text(684, 94, 'Most used languages', 'panel-title')}<g clip-path="url(#language-clip)">${bar}</g>${languageRows}
${frame(40, 236, 690, 206, 'Contribution field')}${monthTicks(daily, 66, 297, 636)}<g id="contribution-cells">${cells}</g>
<g mask="url(#field-sweep)"><rect x="66" y="309" width="638" height="94" class="field-light"/></g>
${frame(748, 236, 412, 206, 'Time of day')}${ring}
<circle cx="966" cy="349" r="33" fill="none" class="rule"/><path d="M966,316 A33,33 0 0 0 933,349" class="orbit"/>
${text(966, 266, '00:00', 'axis', 'text-anchor="middle"')}${text(881, 353, '06:00', 'axis', 'text-anchor="end"')}${text(966, 435, '12:00', 'axis', 'text-anchor="middle"')}${text(1051, 353, '18:00', 'axis')}
${frame(40, 460, 552, 206, 'Commits / day')}${graph(daily, 'commits', 96, commits)}
${frame(608, 460, 552, 206, 'Lines of code / day')}
<circle cx="956" cy="489" r="3" fill="var(--signal)"/>${text(965, 494, '+', 'axis')}<circle cx="995" cy="489" r="3" fill="var(--deletion)"/>${text(1004, 494, '−', 'axis')}
${graph(daily, 'loc', 664, totals, deletions)}
</svg>`;
}

export function renderLanguagesSvg(snapshot = {}, { theme = 'auto' } = {}) {
  const forced = theme === 'light' || theme === 'dark';
  const languages = (snapshot.languages || []).filter((lang) => !/jupyter/i.test(lang.name)).slice(0, 6);
  const layout = columnMajor(languages);
  const rows = Math.max(1, Math.ceil(layout.length / 2));
  const total = Math.max(100, languages.reduce((sum, lang) => sum + count(lang.percentage), 0));
  let cursor = 39;
  const bar = languages.map((lang, index) => {
    const width = count(lang.percentage) / total * 472;
    const segment = `<rect x="${fixed(cursor)}" y="76" width="${fixed(width)}" height="7" fill="${languageColor(lang.name, index)}"/>`;
    cursor += width;
    return segment;
  }).join('');
  const languageRows = layout.map((lang, index) => {
    const x = 39 + Math.floor(index / rows) * 269;
    const y = 113 + (index % rows) * 39;
    return `<circle cx="${x + 3}" cy="${y - 4}" r="3.5" fill="${languageColor(lang.name, index)}"/>${text(x + 15, y, lang.name, 'language')}${text(x + 248, y, `${count(lang.percentage).toFixed(1)}%`, 'measure', 'text-anchor="end"')}${text(x + 15, y + 16, `${number(lang.loc)} LoC`, 'axis')}`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="220" viewBox="0 0 560 220" role="img" aria-labelledby="title desc" data-theme="${forced ? theme : 'auto'}">
<title id="title">Most used languages</title><desc id="desc">Top programming languages by repository language volume.</desc>
<style>
  :root{${variables(palettes[forced ? theme : 'light'])}}
  ${forced ? '' : `@media(prefers-color-scheme:dark){:root{${variables(palettes.dark)}}}`}
  text{font-family:'Segoe UI',Helvetica,sans-serif;fill:var(--ink);font-variant-numeric:tabular-nums}
  .heading{font-size:18px;font-weight:600;letter-spacing:-.25px}.language{font-size:13px}.measure{font-size:12px;fill:var(--ink)}.axis{font-size:12px;fill:var(--muted)}.rule{stroke:var(--rule);stroke-width:1}
</style>
<defs><clipPath id="language-bar-clip"><rect x="39" y="76" width="472" height="7" rx="3.5"/></clipPath></defs>
<path d="M4,24 H556" class="rule"/>
${text(39, 57, 'Most used languages', 'heading')}
<g clip-path="url(#language-bar-clip)">${bar}</g>
${languageRows}
</svg>`;
}
