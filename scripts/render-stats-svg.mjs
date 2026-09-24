const escapeXml = (value) => String(value ?? '').replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
const number = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0);
const dateLabel = (value) => new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(value);

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
  const sampled = sample(values);
  return sampled.map((value, index) => `${(x + (index / Math.max(sampled.length - 1, 1)) * width).toFixed(1)},${(y + height - ((value || 0) / maxValue) * height).toFixed(1)}`);
}

function pathFromPoints(pointString) { return `M${pointString.join(' L')}`; }

function mixColor(start, end, amount) {
  const parse = (value) => value.match(/[\da-f]{2}/gi).map((part) => parseInt(part, 16));
  const a = parse(start); const b = parse(end);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

export function renderStatsSvg(snapshot = {}) {
  const summary = snapshot.summary || {};
  const chart = snapshot.chart || {};
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
  const generatedAt = snapshot.generatedAt ? new Date(snapshot.generatedAt).toISOString().slice(0, 16).replace('T', ' · ') : 'fallback snapshot';
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
    const fill = value === 0 ? '#18232b' : mixColor('#174936', '#63e5a1', Math.max(.14, ratio));
    const x = 64 + Math.floor(index / 7) * 9.85;
    const y = 303 + (index % 7) * 14;
    return `<rect x="${x.toFixed(1)}" y="${y}" width="7" height="8" rx="1.5" fill="${fill}"/>`;
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
    const color = mixColor('#246248', '#68e9a5', value / hourlyMax);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
  }).join('');
  const peakHour = hourly.indexOf(hourlyMax);
  const latestDate = daily.at(-1)?.date ? dateLabel(new Date(`${daily.at(-1).date}T00:00:00Z`)) : 'rolling year';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="740" viewBox="0 0 1200 740" role="img" aria-labelledby="title desc">
  <title id="title">Git Atlas activity dashboard</title>
  <desc id="desc">Git contribution summary and four live activity charts for the rolling year.</desc>
  <style>
    .top-ink{fill:#26343c;font-family:ui-sans-serif,system-ui,sans-serif}.top-muted{fill:#667780;font-family:monospace}.top-label{fill:#3d4d55;font:13px monospace}.small{font-size:10px}.top-rule{stroke:#b5c1c5;stroke-width:1}.panel{fill:#0d141a;fill-opacity:.96;stroke:#344651;stroke-width:1}.panel-title{fill:#dce8e2;font:600 13px ui-sans-serif,system-ui,sans-serif;letter-spacing:1.4px}.panel-meta{fill:#819099;font:10px monospace}.grid-line{stroke:#26343d;stroke-width:1}.axis{fill:#73838c;font:10px monospace}.metric{fill:#26343c;font:500 36px ui-sans-serif,system-ui,sans-serif;letter-spacing:-1.5px}.chart-line{fill:none;stroke:#62e6a2;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.chart-area{fill:#62e6a2;fill-opacity:.16}.loc-line{fill:none;stroke:#b1eb75;stroke-width:2.5;stroke-linejoin:round}.loc-area{fill:#8e72ff;fill-opacity:.22}.loc-top{fill:#b1eb75;fill-opacity:.18}.accent{fill:#55d99a}.brand{fill:#3bbf83;font:11px monospace;letter-spacing:2.6px}
    @media (prefers-color-scheme: dark){.top-ink,.metric{fill:#edf4ef}.top-muted{fill:#9aa9af}.top-label{fill:#d2ded8}.top-rule{stroke:#40525d}}
  </style>
  <text x="40" y="30" class="brand">GIT ATLAS / LIVE ACTIVITY</text><text x="1160" y="30" text-anchor="end" class="top-muted small">UPDATED ${escapeXml(generatedAt)} UTC</text><line x1="40" y1="48" x2="1160" y2="48" class="top-rule"/>
  <text x="40" y="82" class="top-muted small">TOTAL CONTRIBUTIONS</text><text x="40" y="122" class="metric">${number(summary.totalContributions ?? 0)}</text><text x="40" y="143" class="top-muted small">${escapeXml(snapshot.period || 'rolling 365 days')}</text>
  <line x1="230" y1="70" x2="230" y2="164" class="top-rule"/><text x="258" y="82" class="top-muted small">LONGEST WEEK STREAK</text><text x="258" y="122" class="metric">${number(summary.longestWeekStreak ?? 0)} <tspan class="top-muted small">weeks</tspan></text><text x="258" y="143" class="top-muted small">${escapeXml(summary.streakPeriod || 'merges excluded')}</text>
  <line x1="475" y1="70" x2="475" y2="164" class="top-rule"/><text x="503" y="82" class="top-muted small">DAYS CONTRIBUTED</text><text x="503" y="122" class="metric">${number(summary.daysContributed ?? 0)}</text><text x="503" y="143" class="top-muted small">${escapeXml(summary.daysPercent || 'rolling year')}</text>
  <line x1="660" y1="66" x2="660" y2="168" class="top-rule"/><text x="700" y="72" class="top-ink" style="font:600 15px ui-sans-serif,system-ui,sans-serif">Most used languages</text>${languageBar}${languageRows}

  <rect x="40" y="220" width="570" height="205" rx="4" class="panel"/><text x="64" y="250" class="panel-title">CONTRIBUTION FIELD</text><text x="586" y="250" text-anchor="end" class="panel-meta">365 DAYS · DAILY INTENSITY</text>${gridCells}<text x="64" y="404" class="axis">LESS</text><text x="586" y="404" text-anchor="end" class="axis">MORE</text>
  <rect x="630" y="220" width="530" height="205" rx="4" class="panel"/><text x="654" y="250" class="panel-title">TIME OF DAY</text><text x="1136" y="250" text-anchor="end" class="panel-meta">24 WINDOWS · UTC</text><circle cx="900" cy="320" r="85" fill="none" stroke="#344651"/><circle cx="900" cy="320" r="59" fill="none" stroke="#26343d"/>${radialBars}<circle cx="900" cy="320" r="45" fill="#0d141a" stroke="#344651"/><text x="900" y="311" text-anchor="middle" class="panel-meta">PEAK WINDOW</text><text x="900" y="334" text-anchor="middle" class="metric" style="font-size:25px;fill:#edf4ef">${escapeXml(chart.peakHour || `${String(peakHour).padStart(2, '0')}:00`)}</text><text x="900" y="350" text-anchor="middle" class="panel-meta">${escapeXml(chart.peakHourCount || `${number(hourlyMax)} commits`)}</text><text x="900" y="242" text-anchor="middle" class="axis">00:00</text><text x="1006" y="324" class="axis">06:00</text><text x="900" y="414" text-anchor="middle" class="axis">12:00</text><text x="794" y="324" text-anchor="end" class="axis">18:00</text>
  <rect x="40" y="440" width="570" height="260" rx="4" class="panel"/><text x="64" y="470" class="panel-title">COMMITS / DAY</text><text x="586" y="470" text-anchor="end" class="panel-meta">ROLLING YEAR</text><line x1="64" y1="500" x2="586" y2="500" class="grid-line"/><line x1="64" y1="532" x2="586" y2="532" class="grid-line"/><line x1="64" y1="564" x2="586" y2="564" class="grid-line"/><line x1="64" y1="596" x2="586" y2="596" class="grid-line"/><path d="${pathFromPoints(commitLine)} L582,596 L64,596 Z" class="chart-area"/><path d="${pathFromPoints(commitLine)}" class="chart-line"/><text x="64" y="624" class="axis">${escapeXml(daily[0]?.date ? dateLabel(new Date(`${daily[0].date}T00:00:00Z`)) : 'START')}</text><text x="586" y="624" text-anchor="end" class="axis">${escapeXml(latestDate)}</text><text x="64" y="675" class="panel-meta">AVERAGE ${escapeXml(chart.averageCommits ?? '0')} COMMITS / DAY</text><text x="586" y="675" text-anchor="end" class="panel-meta">${escapeXml(chart.peakDay || 'NO PEAK')}</text>
  <rect x="630" y="440" width="530" height="260" rx="4" class="panel"/><text x="654" y="470" class="panel-title">LINES OF CODE / DAY</text><text x="1136" y="470" text-anchor="end" class="panel-meta">ADDITIONS + DELETIONS</text><line x1="654" y1="500" x2="1136" y2="500" class="grid-line"/><line x1="654" y1="532" x2="1136" y2="532" class="grid-line"/><line x1="654" y1="564" x2="1136" y2="564" class="grid-line"/><line x1="654" y1="596" x2="1136" y2="596" class="grid-line"/><path d="${pathFromPoints(locBase)} L1136,596 L664,596 Z" class="loc-area"/><path d="${pathFromPoints(locTop)} ${locBase.slice().reverse().map((point) => `L${point}`).join(' ')} Z" class="loc-top"/><path d="${pathFromPoints(locTop)}" class="loc-line"/><text x="654" y="624" class="axis">${escapeXml(daily[0]?.date ? dateLabel(new Date(`${daily[0].date}T00:00:00Z`)) : 'START')}</text><text x="1136" y="624" text-anchor="end" class="axis">${escapeXml(latestDate)}</text><text x="654" y="675" class="panel-meta">${escapeXml(chart.additions || '0')} ADD</text><text x="820" y="675" class="panel-meta">${escapeXml(chart.deletions || '0')} DEL</text><text x="1136" y="675" text-anchor="end" class="panel-meta">${escapeXml(chart.netLines || 'NET 0')}</text>
  <text x="40" y="720" class="top-muted small">${escapeXml(snapshot.source || 'GitHub snapshot')}</text><text x="1160" y="720" text-anchor="end" class="top-muted small">LIVE SVG · NO PROFILE WORKFLOW REQUIRED</text>
</svg>`;
}
