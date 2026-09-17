document.getElementById('year').textContent = new Date().getFullYear();

const MS_PER_DAY = 86400000;
const DEFAULT_PERIOD_DAYS = 30;

function fmtInt(n){ return new Intl.NumberFormat('en-US').format(n); }
function fmtCount(n, singular, plural){ return fmtInt(n) + ' ' + (n === 1 ? singular : (plural || singular + 's')); }

// URL date format is MM-DD-YYYY, per how this page is meant to be linked —
// deliberately not ISO, so a pasted link reads the same way an American
// calendar date would.
function formatDateParam(date){
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${mm}-${dd}-${yyyy}`;
}
function parseDateParam(str){
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(str || '');
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return isNaN(date.getTime()) ? null : date;
}
function toDateInputValue(date){ return date.toISOString().slice(0, 10); }
function fmtDateLabel(date){
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function addDays(date, days){ return new Date(date.getTime() + days * MS_PER_DAY); }
function daysBetween(a, b){ return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY); }
function clamp(n, min, max){ return Math.min(Math.max(n, min), max); }

function periodWindow(periodDays, endDate){
  return { start: addDays(endDate, -periodDays), end: endDate };
}

let jobs = [];
let earliestDate = null;
let todayDate = null;

const els = {
  periodDays: document.getElementById('period-days'),
  aSlider: document.getElementById('a-slider'),
  bSlider: document.getElementById('b-slider'),
  aDate: document.getElementById('a-date'),
  bDate: document.getElementById('b-date'),
  aRangeText: document.getElementById('a-range-text'),
  bRangeText: document.getElementById('b-range-text'),
  legendA: document.getElementById('legend-a'),
  legendB: document.getElementById('legend-b'),
  headlineGrid: document.getElementById('headline-grid'),
  compareRows: document.getElementById('compare-rows'),
  copyLink: document.getElementById('copy-link'),
  copyLinkText: document.getElementById('copy-link-text'),
};

function sliderValueToDate(value){ return addDays(earliestDate, Number(value)); }
function dateToSliderValue(date){ return clamp(daysBetween(earliestDate, date), 0, daysBetween(earliestDate, todayDate)); }

function setSliderRanges(){
  const max = daysBetween(earliestDate, todayDate);
  [els.aSlider, els.bSlider].forEach((el) => { el.min = 0; el.max = Math.max(max, 1); el.step = 1; });
  [els.aDate, els.bDate].forEach((el) => {
    el.min = toDateInputValue(earliestDate);
    el.max = toDateInputValue(todayDate);
  });
}

function currentPeriodDays(){ return Number(els.periodDays.value) || DEFAULT_PERIOD_DAYS; }

function endDateFor(which){
  const slider = which === 'a' ? els.aSlider : els.bSlider;
  return sliderValueToDate(slider.value);
}

function syncFromSlider(which){
  const date = endDateFor(which);
  (which === 'a' ? els.aDate : els.bDate).value = toDateInputValue(date);
  render();
}
function syncFromDateInput(which){
  const input = which === 'a' ? els.aDate : els.bDate;
  const date = new Date(input.value + 'T00:00:00Z');
  if (isNaN(date.getTime())) return;
  (which === 'a' ? els.aSlider : els.bSlider).value = dateToSliderValue(date);
  render();
}

function updateUrl(){
  const days = currentPeriodDays();
  const params = new URLSearchParams();
  params.set('date1', formatDateParam(endDateFor('a')));
  params.set('date2', formatDateParam(endDateFor('b')));
  if (days !== DEFAULT_PERIOD_DAYS) params.set('days', String(days));
  const url = `${location.pathname}?${params.toString()}`;
  history.replaceState(null, '', url);
}

function countBy(records, getField){
  const m = new Map();
  for (const r of records){
    const v = getField(r);
    if (v == null) continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return Array.from(m.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

function summarizePeriod(start, end){
  const inPeriod = jobs.filter((r) => {
    const d = new Date(r.date);
    return d >= start && d < end;
  });
  const tagCounts = new Map();
  inPeriod.forEach((r) => (r.tags || []).forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
  const tags = Array.from(tagCounts.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  return {
    total: inPeriod.length,
    countries: countBy(inPeriod, (r) => r.country),
    sites: countBy(inPeriod, (r) => r.sourceSite),
    workStyle: countBy(inPeriod, (r) => r.workStyle),
    language: countBy(inPeriod, (r) => r.language),
    tags,
    withSalary: inPeriod.filter((r) => r.salaryMin != null || r.salaryMax != null).length,
  };
}

function deltaText(a, b){
  if (a === 0 && b === 0) return { text: 'no change', cls: 'flat' };
  if (a === 0) return { text: `+${fmtInt(b)}`, cls: 'up' };
  const pct = ((b - a) / a) * 100;
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const sign = pct > 0 ? '+' : '';
  return { text: `${sign}${pct.toFixed(0)}% vs Period A`, cls };
}

function headlineCard(label, aVal, bVal){
  const card = document.createElement('div');
  card.className = 'headline-card';
  const delta = deltaText(aVal, bVal);
  card.innerHTML =
    `<div class="label">${label}</div>` +
    `<div class="values"><span class="a-val num">${fmtInt(aVal)}</span><span class="vs">vs</span><span class="b-val num">${fmtInt(bVal)}</span></div>` +
    `<div class="delta ${delta.cls}">${delta.text}</div>`;
  return card;
}

function compareBarLine(label, count, max, cls){
  const line = document.createElement('div');
  line.className = 'compare-bar-line';
  const pct = max > 0 ? Math.max(2, (count / max) * 100) : 0;
  line.innerHTML =
    `<span class="compare-track"><span class="compare-fill ${cls}" style="width:${pct}%"></span></span>` +
    `<span class="compare-value num">${fmtInt(count)}</span>`;
  return line;
}

function compareRow(label, aItems, bItems, limit = 5){
  const row = document.createElement('div');
  row.className = 'compare-row';
  const names = new Set([...aItems.slice(0, limit).map((i) => i.value), ...bItems.slice(0, limit).map((i) => i.value)]);
  if (names.size === 0){
    row.innerHTML = `<span class="compare-row-label">${label}</span><span class="empty-state">No data in either period yet.</span>`;
    return row;
  }
  const aMap = new Map(aItems.map((i) => [i.value, i.count]));
  const bMap = new Map(bItems.map((i) => [i.value, i.count]));
  const maxCount = Math.max(1, ...Array.from(names).map((n) => Math.max(aMap.get(n) || 0, bMap.get(n) || 0)));
  const bars = document.createElement('div');
  bars.className = 'compare-bars';
  Array.from(names).slice(0, limit).forEach((name) => {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '4px';
    const nameEl = document.createElement('div');
    nameEl.style.fontSize = '12.5px';
    nameEl.style.color = 'var(--ink-soft)';
    nameEl.style.marginBottom = '3px';
    nameEl.textContent = name;
    wrap.appendChild(nameEl);
    wrap.appendChild(compareBarLine('A', aMap.get(name) || 0, maxCount, 'a'));
    wrap.appendChild(compareBarLine('B', bMap.get(name) || 0, maxCount, 'b'));
    bars.appendChild(wrap);
  });
  row.innerHTML = `<span class="compare-row-label">${label}</span>`;
  row.appendChild(bars);
  return row;
}

function render(){
  const days = currentPeriodDays();
  const aEnd = endDateFor('a');
  const bEnd = endDateFor('b');
  const aWindow = periodWindow(days, aEnd);
  const bWindow = periodWindow(days, bEnd);

  els.aRangeText.textContent = `${fmtDateLabel(aWindow.start)} – ${fmtDateLabel(aWindow.end)}`;
  els.bRangeText.textContent = `${fmtDateLabel(bWindow.start)} – ${fmtDateLabel(bWindow.end)}`;
  els.legendA.textContent = `Period A · ${fmtDateLabel(aWindow.start)} – ${fmtDateLabel(aWindow.end)}`;
  els.legendB.textContent = `Period B · ${fmtDateLabel(bWindow.start)} – ${fmtDateLabel(bWindow.end)}`;

  const a = summarizePeriod(aWindow.start, aWindow.end);
  const b = summarizePeriod(bWindow.start, bWindow.end);

  els.headlineGrid.innerHTML = '';
  els.headlineGrid.appendChild(headlineCard('Roles tracked', a.total, b.total));
  els.headlineGrid.appendChild(headlineCard('Roles with a salary', a.withSalary, b.withSalary));
  els.headlineGrid.appendChild(headlineCard(
    'Top working country',
    a.countries[0] ? a.countries[0].count : 0,
    b.countries[0] ? b.countries[0].count : 0
  ));

  els.compareRows.innerHTML = '';
  els.compareRows.appendChild(compareRow('Working countries', a.countries, b.countries));
  els.compareRows.appendChild(compareRow('Source sites', a.sites, b.sites));
  els.compareRows.appendChild(compareRow('Work style', a.workStyle, b.workStyle));
  els.compareRows.appendChild(compareRow('Tags', a.tags, b.tags));
  els.compareRows.appendChild(compareRow('Language', a.language, b.language));

  updateUrl();
}

function initFromUrlOrDefault(){
  const params = new URLSearchParams(location.search);
  const days = Number(params.get('days')) || DEFAULT_PERIOD_DAYS;
  els.periodDays.value = String([7, 14, 30, 90].includes(days) ? days : DEFAULT_PERIOD_DAYS);

  const date1 = parseDateParam(params.get('date1'));
  const date2 = parseDateParam(params.get('date2'));

  const bEnd = date2 && date2 <= todayDate && date2 >= earliestDate ? date2 : todayDate;
  const aEnd = date1 && date1 <= todayDate && date1 >= earliestDate ? date1 : addDays(bEnd, -currentPeriodDaysFromSelect());

  els.aSlider.value = dateToSliderValue(aEnd);
  els.bSlider.value = dateToSliderValue(bEnd);
  els.aDate.value = toDateInputValue(sliderValueToDate(els.aSlider.value));
  els.bDate.value = toDateInputValue(sliderValueToDate(els.bSlider.value));
}
function currentPeriodDaysFromSelect(){ return Number(els.periodDays.value) || DEFAULT_PERIOD_DAYS; }

function wireEvents(){
  els.aSlider.addEventListener('input', () => syncFromSlider('a'));
  els.bSlider.addEventListener('input', () => syncFromSlider('b'));
  els.aDate.addEventListener('change', () => syncFromDateInput('a'));
  els.bDate.addEventListener('change', () => syncFromDateInput('b'));
  els.periodDays.addEventListener('change', render);
  els.copyLink.addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).then(() => {
      els.copyLink.classList.add('copied');
      els.copyLinkText.textContent = 'Link copied';
      setTimeout(() => {
        els.copyLink.classList.remove('copied');
        els.copyLinkText.textContent = 'Copy share link';
      }, 1800);
    }).catch(() => {});
  });
}

// Same chart as the main Stats page's "Remote, hybrid or on-site" trend —
// deliberately independent of the Period A/B picker above (it always
// shows the most recent 8 weeks, not whatever period is selected), so
// it's rendered once here off the same `jobs` array this page already
// loads for the period comparison, rather than tied into render().
const WORKSTYLE_TREND_WEEKS = 8;

function fmtWeekLabel(weekKeyStr){
  return new Date(weekKeyStr + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Sunday-anchored week bucket — same convention this page's own date
// handling already uses for period boundaries.
function workStyleWeekKey(date){
  const d0 = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d0.setUTCDate(d0.getUTCDate() - d0.getUTCDay());
  return d0.toISOString().slice(0, 10);
}

// Rounds a chart's y-axis max up to a "nice" gridline value (1/2/5 x a
// power of ten) instead of the raw max.
function niceAxisMax(n){
  if (n <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(n));
  const residual = n / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return niceResidual * magnitude;
}

function renderWorkStyleTrend(allJobs){
  const svg = document.getElementById('workstyle-trend');
  const note = document.getElementById('workstyle-trend-note');
  if (!svg || !note) return;

  const buckets = new Map();
  allJobs.forEach((r) => {
    const d = new Date(r.date);
    if (isNaN(d.getTime())) return;
    const wk = workStyleWeekKey(d);
    if (!buckets.has(wk)) buckets.set(wk, { onsite: 0, remoteHybrid: 0 });
    const b = buckets.get(wk);
    if (r.workStyle === 'On-site') b.onsite++;
    else if (r.workStyle === 'Remote' || r.workStyle === 'Hybrid') b.remoteHybrid++;
  });

  const weekKeys = Array.from(buckets.keys()).sort().slice(-WORKSTYLE_TREND_WEEKS);
  if (weekKeys.length < 2) {
    svg.innerHTML = '';
    note.textContent = 'Not enough weekly history yet to plot a trend.';
    return;
  }

  const points = weekKeys.map((wk) => ({ week: wk, ...buckets.get(wk) }));
  const yMax = niceAxisMax(Math.max(1, ...points.map((p) => Math.max(p.onsite, p.remoteHybrid))));

  const W = 640, H = 220, marginLeft = 36, marginRight = 16, marginTop = 20, marginBottom = 34;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;
  const xAt = (i) => marginLeft + (points.length > 1 ? (i / (points.length - 1)) * plotW : 0);
  const yAt = (v) => marginTop + plotH - (v / yMax) * plotH;

  const linePoints = (getVal) => points.map((p, i) => `${xAt(i)},${yAt(getVal(p))}`).join(' ');
  const dots = (getVal, color) =>
    points.map((p, i) => `<circle cx="${xAt(i)}" cy="${yAt(getVal(p))}" r="3" fill="${color}"/>`).join('');
  const xLabels = points
    .map((p, i) => `<text x="${xAt(i)}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="var(--ink-faint)">${fmtWeekLabel(p.week)}</text>`)
    .join('');

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML =
    `<line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${yAt(0)}" stroke="var(--line)" stroke-width="1"/>` +
    `<line x1="${marginLeft}" y1="${yAt(0)}" x2="${W - marginRight}" y2="${yAt(0)}" stroke="var(--line)" stroke-width="1"/>` +
    `<text x="${marginLeft - 6}" y="${yAt(0) + 3}" text-anchor="end" font-size="10" fill="var(--ink-faint)">0</text>` +
    `<text x="${marginLeft - 6}" y="${yAt(yMax / 2) + 3}" text-anchor="end" font-size="10" fill="var(--ink-faint)">${fmtInt(Math.round(yMax / 2))}</text>` +
    `<text x="${marginLeft - 6}" y="${yAt(yMax) + 3}" text-anchor="end" font-size="10" fill="var(--ink-faint)">${fmtInt(yMax)}</text>` +
    `<polyline points="${linePoints((p) => p.onsite)}" fill="none" stroke="var(--onsite)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polyline points="${linePoints((p) => p.remoteHybrid)}" fill="none" stroke="var(--remote)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    dots((p) => p.onsite, 'var(--onsite)') +
    dots((p) => p.remoteHybrid, 'var(--remote)') +
    xLabels;

  const last = points[points.length - 1];
  note.textContent = `Last ${points.length} weeks with tracked postings — latest week: ${fmtInt(last.onsite)} on-site, ${fmtInt(last.remoteHybrid)} remote/hybrid.`;
}

fetch('../jobs.json')
  .then((res) => { if (!res.ok) throw new Error('jobs.json not found'); return res.json(); })
  .then((data) => {
    jobs = data;
    todayDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const dates = jobs.map((r) => new Date(r.date)).filter((d) => !isNaN(d.getTime()));
    earliestDate = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : addDays(todayDate, -DEFAULT_PERIOD_DAYS);
    // Truncate to a UTC day boundary so slider day-math stays exact.
    earliestDate = new Date(Date.UTC(earliestDate.getUTCFullYear(), earliestDate.getUTCMonth(), earliestDate.getUTCDate()));

    setSliderRanges();
    initFromUrlOrDefault();
    wireEvents();
    render();
    renderWorkStyleTrend(jobs);
  })
  .catch(() => {
    document.getElementById('results-sub').textContent = 'Comparison data is temporarily unavailable, check back shortly.';
    const note = document.getElementById('workstyle-trend-note');
    if (note) note.textContent = 'Trend data is temporarily unavailable, check back shortly.';
  });

// Top stat ticker — pulls live headline numbers from the JobMatch scraper's
// public stats export so it never drifts out of sync with the stats page.
(() => {
  const track = document.getElementById('stat-ticker-track');
  if (!track) return;
  const STATS_URL = 'https://kennethjensen.me/jobmatch/stats/';
  fetch('../data.json')
    .then((res) => res.json())
    .then((data) => {
      const total = (data.totalTracked || 0).toLocaleString('en-GB');
      const pct = data.trend && typeof data.trend.percentChange === 'number' ? data.trend.percentChange : null;
      const trendHtml = pct === null ? 'steady week on week'
        : pct > 0 ? `<span class="tk-up">&#9650; ${Math.round(pct)}%</span> from last week`
        : pct < 0 ? `<span class="tk-down">&#9660; ${Math.abs(Math.round(pct))}%</span> from last week`
        : 'flat vs last week';
      const tags = (data.tags || []).slice(0, 3).map((t) => `<span class="tk-tag">#${t.value.replace(/[^a-zA-Z0-9]/g, '')}</span>`).join('');
      const sentence = `<strong>${total}</strong> ops jobs live right now (${trendHtml})` + (tags ? `, trending skills are <span class="tk-tags">${tags}</span>` : '');
      const item = `<a class="stat-ticker-item" href="${STATS_URL}">${sentence}</a><span class="stat-ticker-sep" aria-hidden="true">&#9679;</span>`;
      track.innerHTML = item + item;
    })
    .catch(() => {
      track.innerHTML = `<a class="stat-ticker-item" href="${STATS_URL}">See live Nordic/Baltic operations job market stats &rarr;</a>`;
    });
})();
