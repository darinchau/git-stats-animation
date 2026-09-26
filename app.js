const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const numberFormat = new Intl.NumberFormat('en-US');
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const colors = ['#3572a5', '#3178c6', '#e8cf43', '#e55b39', '#dea584', '#3d6117'];
const supersetColors = ['#148451', '#3d73a5', '#e8cf43', '#7657bd', '#e55b39'];

const fallbackDaily = () => Array.from({ length: 365 }, (_, index) => {
  const date = new Date(Date.UTC(2025, 8, 27 + index)).toISOString().slice(0, 10);
  const wave = Math.max(0, Math.round(16 + Math.sin(index * .19) * 11 + Math.sin(index * .041) * 13 + ((index * 17) % 21)));
  const commits = index % 17 === 0 ? 0 : wave;
  const additions = commits * (96 + ((index * 29) % 190));
  const deletions = commits * (31 + ((index * 13) % 92));
  return { date, commits, additions, deletions };
});

const fallbackSnapshot = {
  period: 'Sep 27, 2025 — Sep 26, 2026',
  summary: { totalContributions: 11458, longestWeekStreak: 30, daysContributed: 245, daysPercent: '67.1% of the year', streakPeriod: 'all visible branches · UTC' },
  languages: [
    { name: 'Python', percentage: 52.2, additions: 4348210, deletions: 1105370, net: 3242840 },
    { name: 'TypeScript', percentage: 14.5, additions: 1225840, deletions: 324250, net: 901590 },
    { name: 'JavaScript', percentage: 8.7, additions: 730210, deletions: 189168, net: 541042 },
    { name: 'HTML', percentage: 5.9, additions: 477100, deletions: 112802, net: 364298 },
    { name: 'Rust', percentage: 5.4, additions: 402100, deletions: 68760, net: 333340 },
    { name: 'TeX', percentage: 3.5, additions: 263200, deletions: 44671, net: 218529 }
  ],
  superset: { totalCommits: 11458, breakdown: [
    { label: '2026 commits', value: 6329, note: 'GitHub profile reference' },
    { label: 'Pre-2026 commits', value: 5129, note: 'Rolling-year remainder' },
    { label: 'Fork commits', value: 719, note: 'Forks included in branch scan' },
    { label: 'Merge commits', value: 423, note: 'Merge commits retained in superset' }
  ] },
  chart: { averageCommits: 31.4, peakDay: 'peak 75', additions: '34.8k', deletions: '11.2k', netLines: 'net +23,604 lines', peakHour: '22:00', peakHourCount: '1,144 commits' },
  daily: fallbackDaily(),
  hourlyCommits: [112, 88, 71, 64, 83, 124, 218, 306, 388, 481, 536, 602, 574, 512, 460, 441, 477, 588, 716, 908, 1042, 1111, 1144, 762],
  source: 'Authored fallback snapshot · superset counting · UTC'
};

let snapshot = fallbackSnapshot;
let locScale = 'log';

const formatNumber = (value) => numberFormat.format(Math.round(Number(value) || 0));
const formatCompact = (value) => compactFormat.format(Number(value) || 0);
const netFor = (language) => Number.isFinite(Number(language.net)) ? Number(language.net) : (Number(language.additions || language.loc || 0) - Number(language.deletions || 0));
const setStat = (key, value) => { $$(`[data-stat="${key}"]`).forEach((node) => { node.textContent = value; }); };

function showInsight(title, text) {
  $('#insightTitle').textContent = title;
  $('#insightText').textContent = text;
}

function bindInsight(node, title, text) {
  ['mouseenter', 'focus'].forEach((eventName) => node.addEventListener(eventName, () => showInsight(title, text)));
  node.addEventListener('click', () => showInsight(title, text));
}

function renderLanguages(languages) {
  const meter = $('#languageMeter');
  const list = $('#languageList');
  meter.replaceChildren();
  list.replaceChildren();
  languages.slice(0, 6).forEach((language, index) => {
    const net = netFor(language);
    const meterSegment = document.createElement('span');
    meterSegment.style.width = `${Math.max(1, Number(language.percentage) || 0)}%`;
    meterSegment.style.background = colors[index % colors.length];
    meter.append(meterSegment);

    const item = document.createElement('button');
    item.className = 'language-item';
    item.type = 'button';
    item.dataset.languageIndex = String(index);
    item.innerHTML = `<span class="language-name"><i class="lang-dot" style="background:${colors[index % colors.length]}"></i>${language.name}</span><span class="language-net">${net >= 0 ? '+' : ''}${formatCompact(net)} net</span><span class="language-detail">${formatNumber(language.additions || 0)} additions · ${formatNumber(language.deletions || 0)} deletions</span>`;
    item.addEventListener('mouseenter', () => showInsight(`${language.name} · net lines`, `${formatNumber(language.additions || 0)} additions − ${formatNumber(language.deletions || 0)} deletions = ${net >= 0 ? '+' : ''}${formatNumber(net)} net lines.`));
    item.addEventListener('focus', () => item.dispatchEvent(new Event('mouseenter')));
    item.addEventListener('click', () => {
      $$('.language-item').forEach((button) => button.classList.remove('is-selected'));
      item.classList.add('is-selected');
      showInsight(`${language.name} · additions and deletions`, `${formatNumber(language.additions || 0)} additions − ${formatNumber(language.deletions || 0)} deletions = ${net >= 0 ? '+' : ''}${formatNumber(net)} net lines.`);
    });
    list.append(item);
  });
}

function polarPoint(cx, cy, radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

function arcPath(cx, cy, radius, start, end) {
  const [x1, y1] = polarPoint(cx, cy, radius, start);
  const [x2, y2] = polarPoint(cx, cy, radius, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function renderSuperset(superset) {
  const segments = $('#supersetSegments');
  const legend = $('#supersetLegend');
  segments.replaceChildren();
  legend.replaceChildren();
  const rows = superset.breakdown || [];
  const total = Number(superset.totalCommits) || rows.reduce((sum, row) => sum + Number(row.value || 0), 0) || 1;
  const dimensionTotal = Math.max(total, rows.reduce((sum, row) => sum + Number(row.value || 0), 0));
  setStat('supersetTotal', formatNumber(total));
  let cursor = 0;
  rows.forEach((row, index) => {
    const value = Number(row.value) || 0;
    const span = value / dimensionTotal * 360;
    const start = cursor + 2;
    const end = cursor + Math.max(4, span - 2);
    cursor += span;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('radial-segment');
    path.style.stroke = supersetColors[index % supersetColors.length];
    path.setAttribute('d', arcPath(150, 150, 98, start, end));
    path.setAttribute('tabindex', '0');
    path.setAttribute('aria-label', `${row.label}: ${formatNumber(value)} commits`);
    const title = `${row.label} · ${formatNumber(value)} commits`;
    const detail = `${row.note || 'Included in the superset count.'}. ${((value / dimensionTotal) * 100).toFixed(1)}% of recorded activity.`;
    ['mouseenter', 'focus'].forEach((eventName) => path.addEventListener(eventName, () => showInsight(title, detail)));
    path.addEventListener('click', () => {
      $$('.radial-segment').forEach((segment) => segment.classList.remove('is-selected'));
      path.classList.add('is-selected');
      showInsight(title, detail);
    });
    segments.append(path);

    const rowButton = document.createElement('button');
    rowButton.className = 'legend-row';
    rowButton.type = 'button';
    rowButton.innerHTML = `<i style="background:${supersetColors[index % supersetColors.length]}"></i><span>${row.label}</span><b>${formatNumber(value)}</b><small class="legend-note">${row.note || 'superset source'}</small>`;
    rowButton.addEventListener('mouseenter', () => showInsight(title, detail));
    rowButton.addEventListener('click', () => { $$('.legend-row').forEach((item) => item.classList.remove('is-selected')); rowButton.classList.add('is-selected'); path.dispatchEvent(new Event('click')); });
    legend.append(rowButton);
  });
}

function renderClock(hours) {
  const ring = $('#clockRing');
  ring.replaceChildren();
  const max = Math.max(1, ...hours);
  const peak = hours.indexOf(max);
  setStat('peakHour', `${String(peak).padStart(2, '0')}:00`);
  setStat('peakHourCount', `${formatNumber(max)} commits`);
  hours.forEach((value, hour) => {
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'hour-bar';
    bar.style.setProperty('--angle', `${hour * 15}deg`);
    bar.style.setProperty('--opacity', `${Math.max(.25, .3 + Math.sqrt(value / max) * .7)}`);
    bar.setAttribute('aria-label', `${String(hour).padStart(2, '0')}:00 UTC, ${formatNumber(value)} commits`);
    bar.title = `${String(hour).padStart(2, '0')}:00 UTC · ${formatNumber(value)} commits`;
    const detail = `${formatNumber(value)} commits landed at ${String(hour).padStart(2, '0')}:00 UTC. The ring advances clockwise from midnight.`;
    bar.addEventListener('mouseenter', () => showInsight(`${String(hour).padStart(2, '0')}:00 UTC`, detail));
    bar.addEventListener('focus', () => showInsight(`${String(hour).padStart(2, '0')}:00 UTC`, detail));
    bar.addEventListener('click', () => { $$('.hour-bar').forEach((item) => item.classList.remove('is-selected')); bar.classList.add('is-selected'); showInsight(`${String(hour).padStart(2, '0')}:00 UTC`, detail); });
    ring.append(bar);
  });
}

function sampleSeries(values, count = 72) {
  if (values.length <= count) return values.map((value, index) => ({ value: Number(value) || 0, start: index, end: index }));
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * values.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * values.length / count));
    const slice = values.slice(start, end).map((value) => Number(value) || 0);
    return { value: slice.reduce((sum, value) => sum + value, 0) / slice.length, start, end: end - 1 };
  });
}

function pathFor(points) { return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '); }
function areaFor(points, baseline = 260) { return `${pathFor(points)} L${points[points.length - 1].x.toFixed(1)},${baseline} L0,${baseline} Z`; }
function stackedAreaFor(top, bottom, baseline = 260) { return `${pathFor(top)} ${bottom.slice().reverse().map((point) => `L${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')} Z`; }
function setPath(id, value) { const node = $(`#${id}`); if (node) node.setAttribute('d', value); }

function renderAxis(axisId, gridId, max, formatter = formatCompact) {
  const axis = $(`#${axisId}`);
  const grid = $(`#${gridId}`);
  axis.replaceChildren();
  grid.replaceChildren();
  [1, .75, .5, .25, 0].forEach((ratio) => {
    const value = max * ratio;
    const label = document.createElement('span');
    label.textContent = formatter(value);
    axis.append(label);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0'); line.setAttribute('x2', '900'); line.setAttribute('y1', String(20 + 240 * (1 - ratio))); line.setAttribute('y2', String(20 + 240 * (1 - ratio)));
    grid.append(line);
  });
}

function addPointListeners(container, points, values, label) {
  container.replaceChildren();
  points.forEach((point, index) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.classList.add('chart-point');
    circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y); circle.setAttribute('r', '3');
    const bucket = values[index];
    const day = snapshot.daily[bucket.start];
    const detail = `${day?.date || 'day'} · ${formatNumber(bucket.value)} ${label}`;
    circle.setAttribute('aria-label', detail);
    circle.addEventListener('mouseenter', () => showInsight(label, detail));
    circle.addEventListener('focus', () => showInsight(label, detail));
    circle.addEventListener('click', () => showInsight(label, detail));
    container.append(circle);
  });
}

function plot(values, max, buckets) {
  const points = buckets.map((bucket, index) => ({ x: index / Math.max(1, buckets.length - 1) * 900, y: 260 - (bucket.value / max) * 240 }));
  return { points, buckets };
}

function renderCharts(daily) {
  const commits = daily.map((day) => Number(day.commits) || 0);
  const additions = daily.map((day) => Number(day.additions) || 0);
  const deletions = daily.map((day) => Number(day.deletions) || 0);
  const commitBuckets = sampleSeries(commits);
  const commitRawMax = Math.max(0, ...commits);
  const commitMax = Math.max(20, Math.ceil(commitRawMax / 20) * 20); // every tick is a clean multiple of five
  renderAxis('commitsAxis', 'commitsGrid', commitMax, (value) => String(Math.round(value)));
  const commitPlot = plot(commitBuckets, commitMax, commitBuckets);
  setPath('commitLine', pathFor(commitPlot.points));
  setPath('commitArea', areaFor(commitPlot.points));
  addPointListeners($('#commitPoints'), commitPlot.points, commitBuckets, 'commits');

  const additionBuckets = sampleSeries(additions);
  const deletionBuckets = sampleSeries(deletions);
  const totalBuckets = additionBuckets.map((bucket, index) => ({ ...bucket, value: bucket.value + deletionBuckets[index].value }));
  const transform = (value) => locScale === 'log' ? Math.log10(value + 1) : value;
  const transformedTotals = totalBuckets.map((bucket) => ({ ...bucket, value: transform(bucket.value) }));
  const transformedDeletes = deletionBuckets.map((bucket) => ({ ...bucket, value: transform(bucket.value) }));
  const rawMax = Math.max(1, ...totalBuckets.map((bucket) => bucket.value));
  const scaledMax = Math.max(1, ...transformedTotals.map((bucket) => bucket.value));
  const axisMax = locScale === 'log' ? scaledMax : Math.max(1000, Math.ceil(rawMax / 1000) * 1000);
  const axisFormatter = locScale === 'log' ? (value) => formatCompact(Math.max(0, 10 ** value - 1)) : (value) => formatCompact(value);
  renderAxis('locAxis', 'locGrid', axisMax, axisFormatter);
  const totalPlot = plot(transformedTotals, axisMax, transformedTotals);
  const deletionPlot = plot(transformedDeletes, axisMax, transformedDeletes);
  setPath('locAddition', stackedAreaFor(totalPlot.points, deletionPlot.points));
  setPath('locDeletion', areaFor(deletionPlot.points));
  setPath('locAddLine', pathFor(totalPlot.points));
  setPath('locDeletionLine', pathFor(deletionPlot.points));
  addPointListeners($('#locPoints'), totalPlot.points, totalBuckets, 'net code change');
}

function updateSnapshot(next) {
  snapshot = { ...fallbackSnapshot, ...next, summary: { ...fallbackSnapshot.summary, ...(next.summary || {}) }, chart: { ...fallbackSnapshot.chart, ...(next.chart || {}) }, languages: next.languages?.length ? next.languages : fallbackSnapshot.languages, superset: next.superset || fallbackSnapshot.superset, daily: next.daily?.length ? next.daily : fallbackSnapshot.daily, hourlyCommits: next.hourlyCommits?.length === 24 ? next.hourlyCommits : fallbackSnapshot.hourlyCommits };
  const summary = snapshot.summary;
  const chart = snapshot.chart;
  setStat('totalContributions', formatNumber(summary.totalContributions));
  setStat('longestWeekStreak', formatNumber(summary.longestWeekStreak));
  setStat('daysContributed', formatNumber(summary.daysContributed));
  setStat('daysPercent', summary.daysPercent);
  setStat('period', snapshot.period);
  setStat('streakPeriod', summary.streakPeriod);
  setStat('averageCommits', chart.averageCommits);
  setStat('peakDay', chart.peakDay);
  setStat('additions', chart.additions);
  setStat('deletions', chart.deletions);
  setStat('netLines', chart.netLines);
  setStat('source', snapshot.source || 'Snapshot source unavailable');
  renderLanguages(snapshot.languages);
  renderSuperset(snapshot.superset);
  renderClock(snapshot.hourlyCommits);
  renderCharts(snapshot.daily);
}

$$('[data-insight-title]').forEach((node) => bindInsight(node, node.dataset.insightTitle, node.dataset.insight));
$$('[data-loc-scale]').forEach((button) => button.addEventListener('click', () => { locScale = button.dataset.locScale; $$('[data-loc-scale]').forEach((item) => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active)); }); renderCharts(snapshot.daily); showInsight(`Lines of code · ${locScale === 'log' ? 'logarithmic' : 'normal'} scale`, locScale === 'log' ? 'Log is the default so quiet days remain readable beside large spikes.' : 'Normal scale preserves proportional distance between daily totals.'); }));

updateSnapshot(fallbackSnapshot);
fetch('data/stats.json', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((remote) => { if (remote) updateSnapshot(remote); }).catch(() => { /* fallback data remains visible */ });
