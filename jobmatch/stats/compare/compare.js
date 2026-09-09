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
  })
  .catch(() => {
    document.getElementById('results-sub').textContent = 'Comparison data is temporarily unavailable, check back shortly.';
  });
