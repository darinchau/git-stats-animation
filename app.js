const stage = document.querySelector('#stage');
const tabs = [...document.querySelectorAll('.panel-tab')];
const panelIndex = document.querySelector('#panelIndex');
const pauseButton = document.querySelector('.pause-button');
const pauseLabel = document.querySelector('.pause-label');
const grid = document.querySelector('#contributionGrid');
const radialTicks = document.querySelector('#radialTicks');

let activePanel = 0;
let isPaused = false;
let timer;

function buildContributionGrid() {
  const cells = 53 * 7;
  const hotspot = new Set([22, 23, 24, 25, 26, 84, 85, 86, 87, 88, 89, 128, 129, 130, 131, 167, 168, 169, 170, 171, 172, 173, 207, 208, 209, 210, 211, 242, 243, 244, 245, 246, 281, 282, 283, 284, 285, 320, 321, 322, 323, 324, 325, 366, 367, 368, 369]);
  for (let i = 0; i < cells; i += 1) {
    const cell = document.createElement('span');
    const seasonal = Math.sin(i * 0.21) + Math.sin(i * 0.051) * 0.8;
    const random = ((i * 17) % 13) / 13;
    const intensity = hotspot.has(i) ? 4 : seasonal + random > 1.38 ? 3 : seasonal + random > .64 ? 2 : seasonal + random > -.1 ? 1 : 0;
    cell.className = `contribution-cell level-${intensity}`;
    cell.title = `${Math.max(0, intensity * 2 + (i % 5))} commits`;
    grid.appendChild(cell);
  }
}

function buildRadialTicks() {
  for (let i = 0; i < 24; i += 1) {
    const tick = document.createElement('i');
    const angle = i * 15;
    const height = 10 + Math.round((Math.sin(i * 0.61) + 1) * 9 + ((i * 7) % 6));
    tick.style.setProperty('--tick-angle', `${angle}deg`);
    tick.style.setProperty('--tick-height', `${height}px`);
    tick.style.setProperty('--tick-color', i > 17 || i < 2 ? '#b9f27c' : i > 5 && i < 12 ? '#70c8ed' : '#2e7558');
    radialTicks.appendChild(tick);
  }
}

function formatInteger(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function sampleValues(values, count = 48) {
  if (values.length <= count) return values;
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * values.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * values.length / count));
    const bucket = values.slice(start, end);
    return bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
  });
}

function pointsFor(values, max = Math.max(...values, 1)) {
  const sampled = sampleValues(values);
  return sampled.map((value, index) => ({ x: (index / (sampled.length - 1)) * 900, y: 270 - (value / max) * 242 }));
}

function linePath(points) {
  return points.reduce((path, point, index) => index ? `${path} L${point.x.toFixed(1)},${point.y.toFixed(1)}` : `M${point.x.toFixed(1)},${point.y.toFixed(1)}`, '');
}

function areaPath(points, baseline = 270) {
  return `${linePath(points)} L${points.at(-1).x.toFixed(1)},${baseline} L0,${baseline} Z`;
}

function stackedAreaPath(top, bottom) {
  return `${linePath(top)} ${bottom.slice().reverse().map((point) => `L${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')} Z`;
}

function updateCharts(snapshot) {
  if (!Array.isArray(snapshot.daily) || snapshot.daily.length < 2) return;
  const commits = snapshot.daily.map((day) => Number(day.commits) || 0);
  const additions = snapshot.daily.map((day) => Number(day.additions) || 0);
  const deletions = snapshot.daily.map((day) => Number(day.deletions) || 0);
  const commitPoints = pointsFor(commits);
  document.querySelector('#commitLine')?.setAttribute('d', linePath(commitPoints));
  document.querySelector('#commitArea')?.setAttribute('d', areaPath(commitPoints));
  const total = additions.map((value, index) => value + deletions[index]);
  const max = Math.max(...total, 1);
  const deletionPoints = pointsFor(deletions, max);
  const totalPoints = pointsFor(total, max);
  document.querySelector('#locDeletion')?.setAttribute('d', areaPath(deletionPoints));
  document.querySelector('#locAddition')?.setAttribute('d', stackedAreaPath(totalPoints, deletionPoints));
  document.querySelector('#locAddLine')?.setAttribute('d', linePath(totalPoints));
}

function updateRadial(hourlyCommits) {
  if (!Array.isArray(hourlyCommits)) return;
  const max = Math.max(...hourlyCommits, 1);
  [...radialTicks.children].forEach((tick, index) => {
    tick.style.setProperty('--tick-height', `${8 + Math.round((hourlyCommits[index] / max) * 22)}px`);
  });
}

function updateSnapshot(snapshot) {
  const summary = snapshot.summary || {};
  const chart = snapshot.chart || {};
  const values = {
    totalContributions: summary.totalContributions == null ? null : formatInteger(summary.totalContributions),
    period: snapshot.period,
    longestWeekStreak: summary.longestWeekStreak,
    streakPeriod: summary.streakPeriod,
    daysContributed: summary.daysContributed,
    daysPercent: summary.daysPercent,
    gridFooter: summary.totalContributions == null ? null : `${formatInteger(summary.totalContributions)} total commits`,
    averageCommits: chart.averageCommits,
    peakDay: chart.peakDay,
    additions: chart.additions,
    deletions: chart.deletions,
    netLines: chart.netLines,
    peakHour: chart.peakHour,
    peakHourCount: chart.peakHourCount
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value != null) document.querySelectorAll(`[data-stat="${key}"]`).forEach((node) => { node.textContent = value; });
  });
  if (Array.isArray(snapshot.languages) && snapshot.languages.length) {
    const languageItems = [...document.querySelectorAll('[data-language]')];
    languageItems.forEach((item, index) => {
      const language = snapshot.languages[index];
      if (!language) return;
      item.dataset.language = language.name;
      const name = item.querySelector('.language-name');
      if (name) {
        const dot = name.querySelector('.lang-dot');
        name.textContent = '';
        if (dot) {
          dot.className = `lang-dot ${['python', 'cpp', 'ts', 'go', 'rust', 'js'][index] || 'python'}`;
          name.append(dot);
        }
        name.append(document.createTextNode(language.name));
      }
      const stat = item.querySelector('.language-stat');
      if (stat) stat.innerHTML = `${Number(language.percentage).toFixed(2)}% <b>${formatInteger(language.loc)} LoC</b>`;
    });
  }
  updateCharts(snapshot);
  updateRadial(snapshot.hourlyCommits);
}

function selectPanel(index, shouldRestart = true) {
  activePanel = (index + 4) % 4;
  stage.style.setProperty('--rotation', `${activePanel * -90}deg`);
  panelIndex.textContent = String(activePanel + 1).padStart(2, '0');
  tabs.forEach((tab, i) => {
    const selected = i === activePanel;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-current', selected ? 'true' : 'false');
  });
  if (shouldRestart && !isPaused) startTimer();
}

function startTimer() {
  clearTimeout(timer);
  timer = setTimeout(() => selectPanel(activePanel + 1), 8000);
}

tabs.forEach((tab) => tab.addEventListener('click', () => selectPanel(Number(tab.dataset.panel))));
document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight') selectPanel(activePanel + 1);
  if (event.key === 'ArrowLeft') selectPanel(activePanel - 1);
  if (event.key === ' ') {
    const focused = document.activeElement?.tagName;
    if (focused !== 'BUTTON' && focused !== 'INPUT') { event.preventDefault(); togglePause(); }
  }
});

function togglePause() {
  isPaused = !isPaused;
  pauseButton.classList.toggle('is-playing', !isPaused);
  pauseButton.setAttribute('aria-pressed', String(isPaused));
  pauseButton.setAttribute('aria-label', isPaused ? 'Resume animation' : 'Pause animation');
  pauseLabel.textContent = isPaused ? 'Resume orbit' : 'Pause orbit';
  if (isPaused) clearTimeout(timer); else startTimer();
}

pauseButton.addEventListener('click', togglePause);
buildContributionGrid();
buildRadialTicks();
pauseButton.classList.add('is-playing');
startTimer();
fetch('data/stats.json', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((snapshot) => { if (snapshot) updateSnapshot(snapshot); }).catch(() => { /* authored fallback remains visible */ });
