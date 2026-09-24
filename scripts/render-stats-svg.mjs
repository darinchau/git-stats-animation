const escapeXml = (value) => String(value ?? '').replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
const number = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0);

function points(values, x, y, width, height, maxValue = Math.max(...values, 1)) {
  const sampled = values.length > 64 ? Array.from({ length: 64 }, (_, index) => {
    const start = Math.floor(index * values.length / 64);
    const end = Math.max(start + 1, Math.floor((index + 1) * values.length / 64));
    const bucket = values.slice(start, end);
    return bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
  }) : values;
  return sampled.map((value, index) => `${(x + (index / Math.max(sampled.length - 1, 1)) * width).toFixed(1)},${(y + height - ((value || 0) / maxValue) * height).toFixed(1)}`);
}

function pathFromPoints(pointString) { return `M${pointString.join(' L')}`; }

export function renderStatsSvg(snapshot = {}) {
  const summary = snapshot.summary || {};
  const chart = snapshot.chart || {};
  const languages = (snapshot.languages || []).slice(0, 6);
  const daily = Array.isArray(snapshot.daily) && snapshot.daily.length ? snapshot.daily : Array.from({ length: 52 }, (_, index) => ({ commits: Math.max(0, Math.round(16 + Math.sin(index * .6) * 13 + (index % 7) * 2)), additions: 120 + (index * 47) % 280, deletions: 30 + (index * 23) % 120 }));
  const commits = daily.map((day) => Number(day.commits) || 0);
  const additions = daily.map((day) => Number(day.additions) || 0);
  const deletions = daily.map((day) => Number(day.deletions) || 0);
  const commitLine = points(commits, 62, 358, 480, 110);
  const locMax = Math.max(...additions.map((value, index) => value + deletions[index]), 1);
  const locTop = points(additions.map((value, index) => value + deletions[index]), 62, 505, 480, 78, locMax);
  const locBase = points(deletions, 62, 505, 480, 78, locMax);
  const hourly = Array.isArray(snapshot.hourlyCommits) && snapshot.hourlyCommits.length === 24 ? snapshot.hourlyCommits : [2, 1, 1, 2, 3, 5, 8, 12, 15, 18, 21, 24, 22, 18, 16, 14, 13, 16, 20, 29, 38, 46, 52, 28];
  const hourlyMax = Math.max(...hourly, 1);
  const generatedAt = snapshot.generatedAt ? new Date(snapshot.generatedAt).toISOString().slice(0, 16).replace('T', ' · ') : 'fallback snapshot';
  const languageColors = ['#67e8a5', '#9b7bff', '#b9f27c', '#70c8ed', '#ffb365', '#5b9bd5'];
  const languageTotal = languages.reduce((sum, language) => sum + Number(language.percentage || 0), 0) || 100;
  const languageBar = languages.reduce((output, language, index) => `${output}<rect x="${690 + languages.slice(0, index).reduce((sum, item) => sum + Number(item.percentage || 0) / languageTotal * 460, 0)}" y="86" width="${Number(language.percentage || 0) / languageTotal * 460}" height="7" fill="${languageColors[index]}"/>`, '');
  const languageRows = languages.map((language, index) => {
    const x = index % 2 === 0 ? 690 : 930;
    const y = 130 + Math.floor(index / 2) * 30;
    return `<circle cx="${x}" cy="${y - 4}" r="4" fill="${languageColors[index]}"/><text x="${x + 12}" y="${y}" class="label">${escapeXml(language.name)}</text><text x="${x + 12}" y="${y + 13}" class="muted small">${Number(language.percentage || 0).toFixed(2)}% · ${number(language.loc)} LoC</text>`;
  }).join('');
  const gridCells = Array.from({ length: 364 }, (_, index) => {
    const value = commits[index % commits.length] || 0;
    const level = value > 48 ? '#67e8a5' : value > 28 ? '#2bad6d' : value > 12 ? '#1d7951' : value > 0 ? '#164938' : '#18232b';
    const x = 62 + Math.floor(index / 7) * 12;
    const y = 236 + (index % 7) * 12;
    return `<rect x="${x}" y="${y}" width="8" height="8" rx="2" fill="${level}"/>`;
  }).join('');
  const radialBars = hourly.map((value, index) => {
    const angle = index * 15 - 90;
    const radians = angle * Math.PI / 180;
    const inner = 70;
    const outer = inner + 16 + (value / hourlyMax) * 38;
    const x1 = 978 + Math.cos(radians) * inner;
    const y1 = 464 + Math.sin(radians) * inner;
    const x2 = 978 + Math.cos(radians) * outer;
    const y2 = 464 + Math.sin(radians) * outer;
    const color = value === hourlyMax ? '#b9f27c' : index > 17 || index < 3 ? '#67e8a5' : '#2e7558';
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680" viewBox="0 0 1200 680" role="img" aria-labelledby="title desc">
  <title id="title">Git Atlas activity dashboard</title><desc id="desc">Live Git contribution summary with a contribution field, daily commit line, code volume line, and time of day radial chart.</desc>
  <style>
    .ink{fill:#f1f3ee;font-family:Arial,sans-serif}.muted{fill:#8b969e;font-family:monospace}.label{fill:#d5dad7;font:13px monospace}.small{font-size:10px}.rule{stroke:#40505d;stroke-width:1}.grid{stroke:#28323d;stroke-width:1}.panel{fill:#0f141a;fill-opacity:.92;stroke:#40505d}.metric{fill:#f1f3ee;font:500 34px Arial,sans-serif;letter-spacing:-1.8px}.kicker{fill:#67e8a5;font:10px monospace;letter-spacing:2px}.chart-line{fill:none;stroke:#67e8a5;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.chart-area{fill:#67e8a5;fill-opacity:.12}.loc-area{fill:#9b7bff;fill-opacity:.18}.loc-line{fill:none;stroke:#b9f27c;stroke-width:2;stroke-linejoin:round}.axis{fill:#56636d;font:9px monospace}
  </style>
  <text x="40" y="38" class="kicker">GIT ATLAS / LIVE ACTIVITY</text><text x="1160" y="38" text-anchor="end" class="muted small">UPDATED ${escapeXml(generatedAt)} UTC</text><line x1="40" y1="56" x2="1160" y2="56" class="rule"/>
  <text x="40" y="90" class="muted small">TOTAL CONTRIBUTIONS</text><text x="40" y="127" class="metric">${number(summary.totalContributions || 11230)}</text><text x="40" y="148" class="muted small">${escapeXml(snapshot.period || 'rolling 365 days')}</text>
  <line x1="260" y1="78" x2="260" y2="160" class="rule"/><text x="282" y="90" class="muted small">LONGEST WEEK STREAK</text><text x="282" y="127" class="metric" fill="#ffb365">${number(summary.longestWeekStreak || 19)} <tspan class="muted small">weeks</tspan></text><text x="282" y="148" class="muted small">${escapeXml(summary.streakPeriod || 'all branches')}</text>
  <line x1="510" y1="78" x2="510" y2="160" class="rule"/><text x="532" y="90" class="muted small">DAYS CONTRIBUTED</text><text x="532" y="127" class="metric">${number(summary.daysContributed || 202)}</text><text x="532" y="148" class="muted small">${escapeXml(summary.daysPercent || 'rolling year')}</text>
  <line x1="665" y1="72" x2="665" y2="165" class="rule"/><text x="690" y="70" class="kicker">LANGUAGE MIX</text>${languageBar}${languageRows}
  <rect x="40" y="190" width="590" height="175" rx="3" class="panel"/><text x="62" y="216" class="kicker">COMMIT FIELD</text><text x="608" y="216" text-anchor="end" class="muted small">365 DAYS</text>${gridCells}<text x="62" y="348" class="axis">LESS</text><text x="590" y="348" text-anchor="end" class="axis">MORE</text>
  <rect x="40" y="386" width="590" height="140" rx="3" class="panel"/><text x="62" y="412" class="kicker">COMMITS / DAY</text><line x1="62" y1="441" x2="610" y2="441" class="grid"/><line x1="62" y1="474" x2="610" y2="474" class="grid"/><line x1="62" y1="507" x2="610" y2="507" class="grid"/><path d="${pathFromPoints(commitLine)} L610,507 L62,507 Z" class="chart-area"/><path d="${pathFromPoints(commitLine)}" class="chart-line"/><text x="62" y="518" class="axis">AUG '25</text><text x="610" y="518" text-anchor="end" class="axis">TODAY</text>
  <rect x="40" y="546" width="590" height="94" rx="3" class="panel"/><text x="62" y="570" class="kicker">LINES OF CODE / DAY</text><path d="${pathFromPoints(locBase)} L542,583 L62,583 Z" class="loc-area"/><path d="${pathFromPoints(locTop)} ${locBase.slice().reverse().map((point) => `L${point}`).join(' ')} Z" fill="#b9f27c" fill-opacity=".2"/><path d="${pathFromPoints(locTop)}" class="loc-line"/><text x="62" y="625" class="axis">ADDITIONS + DELETIONS</text>
  <rect x="665" y="190" width="495" height="450" rx="3" class="panel"/><text x="690" y="216" class="kicker">TIME OF DAY</text><text x="1135" y="216" text-anchor="end" class="muted small">24 WINDOWS / UTC</text><circle cx="978" cy="464" r="104" fill="none" class="rule"/><circle cx="978" cy="464" r="73" fill="none" class="grid"/>${radialBars}<circle cx="978" cy="464" r="54" fill="#0f141a" stroke="#40505d"/><text x="978" y="452" text-anchor="middle" class="muted small">PEAK WINDOW</text><text x="978" y="477" text-anchor="middle" class="metric" font-size="26">${escapeXml(chart.peakHour || '22:30')}</text><text x="978" y="496" text-anchor="middle" class="muted small">${escapeXml(chart.peakHourCount || 'activity')}</text><text x="978" y="342" text-anchor="middle" class="axis">00:00</text><text x="1100" y="468" class="axis">06:00</text><text x="978" y="592" text-anchor="middle" class="axis">12:00</text><text x="856" y="468" text-anchor="end" class="axis">18:00</text><text x="690" y="614" class="muted small">SOURCE: ${escapeXml(snapshot.source || 'GitHub snapshot')}</text>
</svg>`;
}
