document.getElementById('year').textContent = new Date().getFullYear();

// Every label on this page ultimately comes from data.json, which the scraper
// builds out of third-party job listings — tag names are derived from scraped
// job titles. Treat all of it as untrusted and escape before it reaches
// innerHTML, or a crafted listing becomes script running on this page.
function esc(v){
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtInt(n){ return new Intl.NumberFormat('en-US').format(n); }

function fmtCount(n, singular, plural){ return fmtInt(n) + ' ' + (n === 1 ? singular : (plural || singular + 's')); }

function fmtDate(iso){
  if (!iso) return 'unknown';
  return new Date(iso).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function statCard(value, unit, label, sub, subClass){
  const card = document.createElement('div');
  card.className = 'stat-card';
  card.innerHTML =
    '<div class="stat-value num">' + esc(value) + (unit ? '<span class="unit">' + esc(unit) + '</span>' : '') + '</div>' +
    '<div class="stat-label">' + esc(label) + '</div>' +
    (sub ? '<div class="stat-sub' + (subClass ? ' ' + esc(subClass) : '') + '">' + esc(sub) + '</div>' : '');
  return card;
}

// Fixed career-ladder order — deliberately not sorted by count, unlike
// every other bar chart on this page, so the shape of the funnel/pyramid
// itself is the point.
const SENIORITY_TIERS = [
  { value: 'Entry', color: '#e8e0fc' },
  { value: 'Junior', color: '#bca5f7' },
  { value: 'Mid', color: '#906af1' },
  { value: 'Senior', color: '#6c3aed' },
  { value: 'C-Level', color: '#442494' },
];

function seniorityRow(label, widthPercent, valueText, color){
  const row = document.createElement('div');
  row.className = 'seniority-row';
  row.innerHTML =
    '<span class="seniority-label"><span class="seniority-dot" style="background:' + esc(color) + '"></span>' + esc(label) + '</span>' +
    '<span class="seniority-track"><span class="seniority-fill" style="width:' + esc(widthPercent) + '%;background:' + esc(color) + '"></span></span>' +
    '<span class="seniority-value num">' + esc(valueText) + '</span>';
  return row;
}

// Same country list, aliases and colours as jobmatch/jobmatch.js's own
// COUNTRIES — duplicated rather than shared (this is a static site, no
// build step to import a common module across the two page bundles).
// Colours are loosely flag-inspired; `bg` is `text` mixed ~14% into white.
const COUNTRIES = [
  { value: 'Denmark', aliases: ['denmark', 'danmark'], text: '#c0392b', bg: '#f6e3e1' },
  { value: 'Norway', aliases: ['norway', 'norge'], text: '#2e5fa3', bg: '#e2e9f2' },
  { value: 'Sweden', aliases: ['sweden', 'sverige'], text: '#e0a622', bg: '#fbf3e0' },
  { value: 'Finland', aliases: ['finland', 'suomi'], text: '#2f6fed', bg: '#e2ebfc' },
  { value: 'Iceland', aliases: ['iceland', 'island', 'ísland'], text: '#1f9e8f', bg: '#e0f1ef' },
  { value: 'Greenland', aliases: ['greenland', 'gronland', 'grønland', 'kalaallit nunaat'], text: '#4a90c9', bg: '#e6eff7' },
  { value: 'Estonia', aliases: ['estonia', 'eesti'], text: '#1f3a5f', bg: '#e0e3e9' },
  { value: 'Latvia', aliases: ['latvia', 'latvija'], text: '#8a1f3a', bg: '#efe0e3' },
  { value: 'Lithuania', aliases: ['lithuania', 'lietuva'], text: '#2f7a3d', bg: '#e2ece4' },
];
const COUNTRY_BY_VALUE = new Map(COUNTRIES.map((c) => [c.value, c]));

function barRow(label, count, widthPercent, valueText, muted, color){
  const row = document.createElement('div');
  row.className = 'bar-row';
  const dot = color ? '<span class="bar-dot" style="background:' + esc(color) + '"></span>' : '';
  const fillStyle = 'width:' + esc(widthPercent) + '%' + (color && !muted ? ';background:' + esc(color) : '');
  row.innerHTML =
    '<span class="bar-label">' + dot + esc(label) + '</span>' +
    '<span class="bar-track"><span class="bar-fill' + (muted ? ' muted' : '') + '" style="' + fillStyle + '"></span></span>' +
    '<span class="bar-value num">' + esc(valueText) + '</span>';
  return row;
}

function render(data){
  const asofEl = document.getElementById('asof-text');
  asofEl.textContent = data.totalTracked + ' open role' + (data.totalTracked === 1 ? '' : 's') + ' tracked · data as of ' + fmtDate(data.dataAsOf);

  const grid = document.getElementById('stat-grid');
  const countryBars = document.getElementById('country-bars');
  const seniorityBars = document.getElementById('seniority-bars');
  grid.innerHTML = '';
  countryBars.innerHTML = '';
  seniorityBars.innerHTML = '';

  // Stat grid
  const trend = data.trend;
  const trendUp = trend.percentChange !== null && trend.percentChange > 0;
  const trendDown = trend.percentChange !== null && trend.percentChange < 0;
  const trendText = trend.percentChange === null
    ? trend.currentCount + ' new (no prior week to compare)'
    : (trendUp ? '+' : '') + trend.percentChange.toFixed(0) + '% vs ' + fmtInt(trend.previousCount) + ' last week';

  const topCountry = data.countries[0];
  const topCountryShare = topCountry && data.totalTracked ? Math.round((topCountry.count / data.totalTracked) * 100) : null;

  grid.appendChild(statCard(fmtInt(data.totalTracked), null, 'Open roles tracked', 'out of ' + fmtInt(data.sitesConfigured || data.sourceSites.length) + ' sites tracked, ' + fmtCount(data.sourceSites.length, 'site') + ' carried an interesting job'));
  grid.appendChild(statCard(fmtInt(trend.currentCount), null, 'Posted this week', trendText, trendUp ? 'up' : (trendDown ? 'down' : '')));
  grid.appendChild(statCard(
    topCountry ? fmtInt(topCountry.count) : '-',
    null,
    topCountry ? topCountry.value + ' leads' : 'No location data yet',
    topCountryShare !== null ? topCountryShare + '% of all tracked roles' : ''
  ));
  grid.appendChild(statCard(fmtInt(data.sitesConfigured || data.sourceSites.length), null, 'Sites monitored', 'checked every second day, last check on ' + fmtDate(data.dataAsOf)));

  // Country bars — colour-coded per country, same palette as the
  // /jobmatch/ search bar's country pills, so the two pages read as one
  // visual language.
  const countryTotal = data.totalTracked || 1;
  data.countries.forEach((c) => {
    const color = COUNTRY_BY_VALUE.has(c.value) ? COUNTRY_BY_VALUE.get(c.value).text : null;
    countryBars.appendChild(barRow(c.value, c.count, Math.max(2, (c.count / countryTotal) * 100), fmtInt(c.count) + ' · ' + Math.round((c.count / countryTotal) * 100) + '%', false, color));
  });
  if (data.unlocatedCount > 0) {
    countryBars.appendChild(barRow('Not clear', data.unlocatedCount, Math.max(2, (data.unlocatedCount / countryTotal) * 100), fmtInt(data.unlocatedCount) + ' · ' + Math.round((data.unlocatedCount / countryTotal) * 100) + '%', true));
  }
  if (data.countries.length === 0 && data.unlocatedCount === 0) {
    countryBars.innerHTML = '<p class="empty-state">No roles tracked yet.</p>';
  }

  renderWorkStyleDonut(data);

  // Seniority ladder bars — fixed Entry → C-Level order (see SENIORITY_TIERS)
  const levelCounts = {};
  data.experienceLevel.forEach((l) => { levelCounts[l.value] = l.count; });
  const seniorityTotal = SENIORITY_TIERS.reduce((sum, t) => sum + (levelCounts[t.value] || 0), 0);
  if (seniorityTotal === 0) {
    seniorityBars.innerHTML = '<p class="empty-state">No roles classified by seniority yet.</p>';
  } else {
    SENIORITY_TIERS.forEach((tier) => {
      const count = levelCounts[tier.value] || 0;
      const pct = Math.round((count / seniorityTotal) * 100);
      seniorityBars.appendChild(seniorityRow(tier.value, count > 0 ? Math.max(2, pct) : 0, fmtInt(count) + ' · ' + pct + '%', tier.color));
    });
  }
}

// Work style: donut (composition, right now) + trend (real weekly counts,
// picked over the plain chip list that used to sit here specifically so
// the "63% not stated" reality stays visible instead of getting silently
// dropped once there was finally enough data to justify a chart at all —
// see the donut's own centre label and the section's lede paragraph.
function renderWorkStyleDonut(data) {
  const svg = document.getElementById('workstyle-donut');
  const legend = document.getElementById('workstyle-legend');
  if (!svg || !legend) return;

  const counts = {};
  data.workStyle.forEach((w) => { counts[w.value] = w.count; });
  const onsite = counts['On-site'] || 0;
  const remote = counts['Remote'] || 0;
  const hybrid = counts['Hybrid'] || 0;
  const classified = onsite + remote + hybrid;
  const total = data.totalTracked || 0;
  const unstated = Math.max(0, total - classified);

  if (total === 0) {
    svg.innerHTML = '';
    legend.innerHTML = '<p class="empty-state">No roles tracked yet.</p>';
    return;
  }

  const classifiedPct = Math.round((classified / total) * 100);
  const segments = [
    { label: 'On-site', count: onsite, color: 'var(--onsite)' },
    { label: 'Remote', count: remote, color: 'var(--remote)' },
    { label: 'Hybrid', count: hybrid, color: 'var(--hybrid)' },
    { label: 'Not stated', count: unstated, color: 'var(--unstated)' },
  ];

  const r = 70;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments
    .filter((s) => s.count > 0)
    .map((s) => {
      const len = (s.count / total) * circumference;
      const dashoffset = -offset;
      offset += len;
      return `<circle r="${r}" fill="none" stroke="${s.color}" stroke-width="26" stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${dashoffset}"/>`;
    })
    .join('');

  svg.setAttribute('viewBox', '0 0 200 200');
  svg.innerHTML =
    `<g transform="translate(100,100) rotate(-90)">${arcs}</g>` +
    `<text x="100" y="96" text-anchor="middle" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="30" fill="var(--ink)">${classifiedPct}%</text>` +
    `<text x="100" y="116" text-anchor="middle" font-size="11" fill="var(--ink-faint)">classified</text>`;

  legend.innerHTML = segments
    .map(
      (s) =>
        `<span class="donut-legend-item"><span class="sw" style="background:${s.color}"></span><b class="num">${fmtInt(s.count)}</b>&nbsp;${esc(s.label)}<span class="pct num">${(
          (s.count / total) * 100
        ).toFixed(1)}%</span></span>`
    )
    .join('');
}

const TREND_WEEKS = 8;

function fmtWeekLabel(weekKeyStr) {
  return new Date(weekKeyStr + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Sunday-anchored week bucket, same convention Compare mode's own period
// date-math further down this file uses — keeps "which week is this row
// in" consistent between the two.
function workStyleWeekKey(date) {
  const d0 = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d0.setUTCDate(d0.getUTCDate() - d0.getUTCDay());
  return d0.toISOString().slice(0, 10);
}

// Rounds a chart's y-axis max up to a "nice" gridline value (1/2/5 x a
// power of ten) rather than the raw max, so the top gridline reads as a
// round number instead of e.g. "146".
function niceAxisMax(n) {
  if (n <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(n));
  const residual = n / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return niceResidual * magnitude;
}

// jobs.json (per-row, dated) is fetched separately from data.json (the
// pre-aggregated snapshot) purely because a weekly trend needs individual
// dates data.json doesn't carry — same file Compare mode further down
// this file relies on, no new export needed.
function renderWorkStyleTrend(jobs) {
  const svg = document.getElementById('workstyle-trend');
  const note = document.getElementById('workstyle-trend-note');
  if (!svg || !note) return;

  const buckets = new Map();
  jobs.forEach((r) => {
    const d = new Date(r.date);
    if (isNaN(d.getTime())) return;
    const wk = workStyleWeekKey(d);
    if (!buckets.has(wk)) buckets.set(wk, { onsite: 0, remoteHybrid: 0 });
    const b = buckets.get(wk);
    if (r.workStyle === 'On-site') b.onsite++;
    else if (r.workStyle === 'Remote' || r.workStyle === 'Hybrid') b.remoteHybrid++;
  });

  const weekKeys = Array.from(buckets.keys()).sort().slice(-TREND_WEEKS);
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
    .map((p, i) => `<text x="${xAt(i)}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="var(--ink-faint)">${esc(fmtWeekLabel(p.week))}</text>`)
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
  note.textContent = `Last ${points.length} weeks with tracked postings; latest week: ${fmtInt(last.onsite)} on-site, ${fmtInt(last.remoteHybrid)} remote/hybrid.`;
}

// Top stat ticker — reuses the same data.json fetch as the stats page below
// rather than issuing a second request for the same file.
function renderTicker(data) {
  const track = document.getElementById('stat-ticker-track');
  if (!track) return;
  const STATS_URL = 'https://kennethjensen.me/jobmatch/stats/';
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
}

// Recomputes every aggregate render() and renderWorkStyleTrend() need,
// straight from jobs.json's per-row rows, in the same shape data.json
// already comes in. Lets the country filter below re-render the whole
// page from a filtered row subset without a second network request.
// Checked against a live data.json/jobs.json pair: with no filter applied
// (i.e. every row), this reproduces data.json's own numbers exactly,
// including the "posted this week vs last week" trend.
function computeAggregates(jobs, dataAsOf, sitesConfigured) {
  const now = new Date(dataAsOf);
  const dayMs = 86400000;
  let currentCount = 0, previousCount = 0, unlocatedCount = 0;
  const countryCounts = new Map();
  const sourceSiteCounts = new Map();
  const workStyleCounts = new Map();
  const experienceLevelCounts = new Map();

  jobs.forEach((r) => {
    const ageMs = now - new Date(r.date);
    if (ageMs >= 0 && ageMs <= 7 * dayMs) currentCount++;
    else if (ageMs > 7 * dayMs && ageMs <= 14 * dayMs) previousCount++;

    if (r.country) countryCounts.set(r.country, (countryCounts.get(r.country) || 0) + 1);
    else unlocatedCount++;
    if (r.sourceSite) sourceSiteCounts.set(r.sourceSite, (sourceSiteCounts.get(r.sourceSite) || 0) + 1);
    if (r.workStyle) workStyleCounts.set(r.workStyle, (workStyleCounts.get(r.workStyle) || 0) + 1);
    if (r.experienceLevel) experienceLevelCounts.set(r.experienceLevel, (experienceLevelCounts.get(r.experienceLevel) || 0) + 1);
  });

  const toSortedArray = (map) => Array.from(map, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  const percentChange = previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : null;

  return {
    dataAsOf,
    totalTracked: jobs.length,
    sitesConfigured,
    trend: { periodDays: 7, currentCount, previousCount, percentChange },
    countries: toSortedArray(countryCounts),
    unlocatedCount,
    sourceSites: toSortedArray(sourceSiteCounts),
    workStyle: toSortedArray(workStyleCounts),
    experienceLevel: toSortedArray(experienceLevelCounts),
  };
}

// Country filter bar — same interaction pattern as /jobmatch/'s own search
// bar and its country-tag autocomplete (see jobmatch.js), repurposed here
// to filter this page's charts instead of a job search: picking a country
// re-renders every chart from the filtered jobs.json subset, via
// computeAggregates() above, rather than hard-filtering a list of jobs.
let allJobs = null;
let statsSnapshot = null; // { dataAsOf, sitesConfigured }, from data.json
let selectedFilterCountries = [];

const filterInput = document.getElementById('filter-input');
const filterTagsEl = document.getElementById('filter-country-tags');
const filterTagsLabelEl = document.getElementById('filter-tags-label');
const filterSuggestionsEl = document.getElementById('filter-suggestions');
const filterSearchBtn = document.getElementById('filter-search');

function normalizeToken(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function renderFilterTags() {
  if (!filterTagsEl) return;
  filterTagsEl.innerHTML = '';
  if (filterTagsLabelEl) filterTagsLabelEl.hidden = selectedFilterCountries.length === 0;
  selectedFilterCountries.forEach((value) => {
    const country = COUNTRY_BY_VALUE.get(value);
    if (!country) return;
    const tag = document.createElement('span');
    tag.className = 'country-tag';
    tag.style.background = country.bg;
    tag.style.color = country.text;
    tag.innerHTML = esc(country.value) + ' <button type="button" aria-label="Remove ' + esc(country.value) + ' filter">&times;</button>';
    tag.querySelector('button').addEventListener('click', () => {
      selectedFilterCountries = selectedFilterCountries.filter((v) => v !== value);
      renderFilterTags();
      applyFilter();
      if (filterInput) filterInput.focus();
    });
    filterTagsEl.appendChild(tag);
  });
}

function hideSuggestions() {
  if (!filterSuggestionsEl) return;
  filterSuggestionsEl.hidden = true;
  filterSuggestionsEl.innerHTML = '';
}

function showSuggestions(query) {
  if (!filterSuggestionsEl) return;
  const token = normalizeToken(query);
  const matches = COUNTRIES.filter((c) =>
    !selectedFilterCountries.includes(c.value) && (token === '' || c.aliases.some((a) => a.startsWith(token)))
  );
  if (matches.length === 0) { hideSuggestions(); return; }
  filterSuggestionsEl.innerHTML = '';
  matches.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'country-suggestion';
    btn.style.background = c.bg;
    btn.style.color = c.text;
    btn.textContent = c.value;
    btn.addEventListener('click', () => selectFilterCountry(c.value));
    filterSuggestionsEl.appendChild(btn);
  });
  filterSuggestionsEl.hidden = false;
}

function selectFilterCountry(value) {
  if (!selectedFilterCountries.includes(value)) selectedFilterCountries.push(value);
  if (filterInput) { filterInput.value = ''; filterInput.focus(); }
  renderFilterTags();
  hideSuggestions();
  applyFilter();
}

// Tag filter row — same pill/autocomplete pattern as the country filter
// above, plus an Include/Exclude mode covering the whole selected set
// (not per-tag). Unlike COUNTRIES, tags aren't a fixed vocabulary here —
// the suggestion list is built from whatever tags actually appear in
// allJobs once it's loaded, sorted by how often each one occurs.
let selectedFilterTags = [];
let tagFilterMode = 'include';

const tagFilterInput = document.getElementById('tag-filter-input');
const tagFilterTagsEl = document.getElementById('tag-filter-tags');
const tagFilterTagsLabelEl = document.getElementById('tag-filter-tags-label');
const tagFilterSuggestionsEl = document.getElementById('tag-filter-suggestions');
const tagFilterModeEl = document.getElementById('tag-filter-mode');

function allTagsSortedByCount() {
  if (!allJobs) return [];
  const counts = new Map();
  allJobs.forEach((r) => (r.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a));
}

function renderTagFilterTags() {
  if (!tagFilterTagsEl) return;
  tagFilterTagsEl.innerHTML = '';
  if (tagFilterTagsLabelEl) {
    tagFilterTagsLabelEl.hidden = selectedFilterTags.length === 0;
    tagFilterTagsLabelEl.textContent = tagFilterMode === 'include' ? 'Must have:' : 'Must not have:';
  }
  selectedFilterTags.forEach((tag) => {
    const el = document.createElement('span');
    el.className = 'country-tag';
    el.style.background = tagFilterMode === 'include' ? 'var(--bg-alt)' : '#f6e3e1';
    el.style.color = tagFilterMode === 'include' ? 'var(--ink)' : '#c0392b';
    el.innerHTML = esc(tag) + ' <button type="button" aria-label="Remove ' + esc(tag) + ' filter">&times;</button>';
    el.querySelector('button').addEventListener('click', () => {
      selectedFilterTags = selectedFilterTags.filter((v) => v !== tag);
      renderTagFilterTags();
      applyFilter();
      if (tagFilterInput) tagFilterInput.focus();
    });
    tagFilterTagsEl.appendChild(el);
  });
}

function hideTagSuggestions() {
  if (!tagFilterSuggestionsEl) return;
  tagFilterSuggestionsEl.hidden = true;
  tagFilterSuggestionsEl.innerHTML = '';
}

function showTagSuggestions(query) {
  if (!tagFilterSuggestionsEl) return;
  const token = normalizeToken(query);
  const matches = allTagsSortedByCount().filter(
    (t) => !selectedFilterTags.includes(t) && (token === '' || normalizeToken(t).startsWith(token))
  );
  if (matches.length === 0) { hideTagSuggestions(); return; }
  tagFilterSuggestionsEl.innerHTML = '';
  matches.forEach((t) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'country-suggestion';
    btn.style.background = 'var(--bg-alt)';
    btn.style.color = 'var(--ink)';
    btn.textContent = t;
    btn.addEventListener('click', () => selectFilterTag(t));
    tagFilterSuggestionsEl.appendChild(btn);
  });
  tagFilterSuggestionsEl.hidden = false;
}

function selectFilterTag(tag) {
  if (!selectedFilterTags.includes(tag)) selectedFilterTags.push(tag);
  if (tagFilterInput) { tagFilterInput.value = ''; tagFilterInput.focus(); }
  renderTagFilterTags();
  hideTagSuggestions();
  applyFilter();
}

if (tagFilterModeEl) {
  tagFilterModeEl.querySelectorAll('.tag-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === tagFilterMode) return;
      tagFilterMode = btn.dataset.mode;
      tagFilterModeEl.querySelectorAll('.tag-mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderTagFilterTags();
      applyFilter();
    });
  });
}

const filterEmptyStateEl = document.getElementById('filter-empty-state');
const statGridEl = document.getElementById('stat-grid');
const filterableSections = ['geography', 'how-people-work', 'seniority'].map((id) => document.getElementById(id));

function applyFilter() {
  if (!allJobs || !statsSnapshot) return; // jobs.json/data.json not loaded yet
  let jobs = selectedFilterCountries.length === 0
    ? allJobs
    : allJobs.filter((r) => r.country && selectedFilterCountries.includes(r.country));
  if (selectedFilterTags.length > 0) {
    jobs = jobs.filter((r) => {
      const hasAny = (r.tags || []).some((t) => selectedFilterTags.includes(t));
      return tagFilterMode === 'include' ? hasAny : !hasAny;
    });
  }

  // A filter combination matching zero jobs gets one clear message instead
  // of the stat grid and every section below each rendering their own
  // empty state (0% donut, empty bar lists, etc.) side by side.
  const filterActive = selectedFilterCountries.length > 0 || selectedFilterTags.length > 0;
  const isEmpty = filterActive && jobs.length === 0;
  if (filterEmptyStateEl) filterEmptyStateEl.hidden = !isEmpty;
  if (statGridEl) statGridEl.hidden = isEmpty;
  filterableSections.forEach((el) => { if (el) el.hidden = isEmpty; });
  if (isEmpty) return;

  render(computeAggregates(jobs, statsSnapshot.dataAsOf, statsSnapshot.sitesConfigured));
  renderWorkStyleTrend(jobs);
}

if (filterInput) {
  filterInput.addEventListener('input', () => showSuggestions(filterInput.value));
  filterInput.addEventListener('focus', () => showSuggestions(filterInput.value));
  filterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && filterInput.value === '' && selectedFilterCountries.length > 0) {
      selectedFilterCountries = selectedFilterCountries.slice(0, -1);
      renderFilterTags();
      applyFilter();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      hideSuggestions();
      applyFilter();
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#filter-form')) hideSuggestions();
  });
}

if (filterSearchBtn) {
  filterSearchBtn.addEventListener('click', () => {
    hideSuggestions();
    applyFilter();
  });
}

if (tagFilterInput) {
  tagFilterInput.addEventListener('input', () => showTagSuggestions(tagFilterInput.value));
  tagFilterInput.addEventListener('focus', () => showTagSuggestions(tagFilterInput.value));
  tagFilterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && tagFilterInput.value === '' && selectedFilterTags.length > 0) {
      selectedFilterTags = selectedFilterTags.slice(0, -1);
      renderTagFilterTags();
      applyFilter();
    } else if (e.key === 'Enter') {
      e.preventDefault();
    } else if (e.key === 'Escape') {
      hideTagSuggestions();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#tag-filter-form')) hideTagSuggestions();
  });
}

// ---------------------------------------------------------------------
// Compare mode — ported from the former /jobmatch/stats/compare/ page,
// now an in-page mode toggled via #mode-toggle instead of a separate
// route. Reuses this page's own allJobs (already fetched below for the
// country filter/trend chart) rather than issuing a second jobs.json
// request the way the old standalone page had to.
// ---------------------------------------------------------------------
const MS_PER_DAY = 86400000;
const DEFAULT_PERIOD_DAYS = 30;

// URL date format is MM-DD-YYYY, matching the old /compare/ page's own
// links — deliberately not ISO, so a pasted link reads the same way an
// American calendar date would. Kept as-is so a comparison already shared
// as a link still parses once opened against this page's own
// ?compare=1&date1=&date2=&days= params.
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

let compareEarliestDate = null;
let compareTodayDate = null;
let compareWired = false;
let currentMode = 'latest';

const modeToggleBtn = document.getElementById('mode-toggle');
const compareControlsEl = document.getElementById('compare-controls');
const compareResultsEl = document.getElementById('compare-results');
const geographySectionEl = document.getElementById('geography');

const cmp = {
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

function sliderValueToDate(value){ return addDays(compareEarliestDate, Number(value)); }
function dateToSliderValue(date){ return clamp(daysBetween(compareEarliestDate, date), 0, daysBetween(compareEarliestDate, compareTodayDate)); }

function setCompareSliderRanges(){
  const max = daysBetween(compareEarliestDate, compareTodayDate);
  [cmp.aSlider, cmp.bSlider].forEach((el) => { el.min = 0; el.max = Math.max(max, 1); el.step = 1; });
  [cmp.aDate, cmp.bDate].forEach((el) => {
    el.min = toDateInputValue(compareEarliestDate);
    el.max = toDateInputValue(compareTodayDate);
  });
}

function currentPeriodDays(){ return Number(cmp.periodDays.value) || DEFAULT_PERIOD_DAYS; }

function endDateFor(which){
  const slider = which === 'a' ? cmp.aSlider : cmp.bSlider;
  return sliderValueToDate(slider.value);
}

function syncCompareFromSlider(which){
  const date = endDateFor(which);
  (which === 'a' ? cmp.aDate : cmp.bDate).value = toDateInputValue(date);
  renderCompare();
}
function syncCompareFromDateInput(which){
  const input = which === 'a' ? cmp.aDate : cmp.bDate;
  const date = new Date(input.value + 'T00:00:00Z');
  if (isNaN(date.getTime())) return;
  (which === 'a' ? cmp.aSlider : cmp.bSlider).value = dateToSliderValue(date);
  renderCompare();
}

function updateCompareUrl(){
  const days = currentPeriodDays();
  const params = new URLSearchParams();
  params.set('compare', '1');
  params.set('date1', formatDateParam(endDateFor('a')));
  params.set('date2', formatDateParam(endDateFor('b')));
  if (days !== DEFAULT_PERIOD_DAYS) params.set('days', String(days));
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
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
  const inPeriod = (allJobs || []).filter((r) => {
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
    '<div class="label">' + esc(label) + '</div>' +
    '<div class="values"><span class="a-val num">' + fmtInt(aVal) + '</span><span class="vs">vs</span><span class="b-val num">' + fmtInt(bVal) + '</span></div>' +
    '<div class="delta ' + esc(delta.cls) + '">' + esc(delta.text) + '</div>';
  return card;
}

function compareBarLine(count, max, cls){
  const line = document.createElement('div');
  line.className = 'compare-bar-line';
  const pct = max > 0 ? Math.max(2, (count / max) * 100) : 0;
  line.innerHTML =
    '<span class="compare-track"><span class="compare-fill ' + esc(cls) + '" style="width:' + pct + '%"></span></span>' +
    '<span class="compare-value num">' + fmtInt(count) + '</span>';
  return line;
}

function compareRow(label, aItems, bItems, limit = 5){
  const row = document.createElement('div');
  row.className = 'compare-row';
  const names = new Set([...aItems.slice(0, limit).map((i) => i.value), ...bItems.slice(0, limit).map((i) => i.value)]);
  if (names.size === 0){
    row.innerHTML = '<span class="compare-row-label">' + esc(label) + '</span><span class="empty-state">No data in either period yet.</span>';
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
    wrap.appendChild(compareBarLine(aMap.get(name) || 0, maxCount, 'a'));
    wrap.appendChild(compareBarLine(bMap.get(name) || 0, maxCount, 'b'));
    bars.appendChild(wrap);
  });
  row.innerHTML = '<span class="compare-row-label">' + esc(label) + '</span>';
  row.appendChild(bars);
  return row;
}

function renderCompare(){
  if (!allJobs || !compareEarliestDate) return; // jobs.json not loaded yet
  const days = currentPeriodDays();
  const aEnd = endDateFor('a');
  const bEnd = endDateFor('b');
  const aWindow = periodWindow(days, aEnd);
  const bWindow = periodWindow(days, bEnd);

  cmp.aRangeText.textContent = fmtDateLabel(aWindow.start) + ' – ' + fmtDateLabel(aWindow.end);
  cmp.bRangeText.textContent = fmtDateLabel(bWindow.start) + ' – ' + fmtDateLabel(bWindow.end);
  cmp.legendA.textContent = 'Period A · ' + fmtDateLabel(aWindow.start) + ' – ' + fmtDateLabel(aWindow.end);
  cmp.legendB.textContent = 'Period B · ' + fmtDateLabel(bWindow.start) + ' – ' + fmtDateLabel(bWindow.end);

  const a = summarizePeriod(aWindow.start, aWindow.end);
  const b = summarizePeriod(bWindow.start, bWindow.end);

  cmp.headlineGrid.innerHTML = '';
  cmp.headlineGrid.appendChild(headlineCard('Roles tracked', a.total, b.total));
  cmp.headlineGrid.appendChild(headlineCard('Roles with a salary', a.withSalary, b.withSalary));
  cmp.headlineGrid.appendChild(headlineCard(
    'Top working country',
    a.countries[0] ? a.countries[0].count : 0,
    b.countries[0] ? b.countries[0].count : 0
  ));

  cmp.compareRows.innerHTML = '';
  cmp.compareRows.appendChild(compareRow('Working countries', a.countries, b.countries));
  cmp.compareRows.appendChild(compareRow('Source sites', a.sites, b.sites));
  cmp.compareRows.appendChild(compareRow('Work style', a.workStyle, b.workStyle));
  cmp.compareRows.appendChild(compareRow('Tags', a.tags, b.tags));
  cmp.compareRows.appendChild(compareRow('Language', a.language, b.language));

  updateCompareUrl();
}

function initCompareFromUrlOrDefault(){
  const params = new URLSearchParams(location.search);
  const days = Number(params.get('days')) || DEFAULT_PERIOD_DAYS;
  cmp.periodDays.value = String([7, 14, 30, 90].includes(days) ? days : DEFAULT_PERIOD_DAYS);

  const date1 = parseDateParam(params.get('date1'));
  const date2 = parseDateParam(params.get('date2'));

  const bEnd = date2 && date2 <= compareTodayDate && date2 >= compareEarliestDate ? date2 : compareTodayDate;
  const aEnd = date1 && date1 <= compareTodayDate && date1 >= compareEarliestDate ? date1 : addDays(bEnd, -currentPeriodDays());

  cmp.aSlider.value = dateToSliderValue(aEnd);
  cmp.bSlider.value = dateToSliderValue(bEnd);
  cmp.aDate.value = toDateInputValue(sliderValueToDate(cmp.aSlider.value));
  cmp.bDate.value = toDateInputValue(sliderValueToDate(cmp.bSlider.value));
}

function wireCompareEvents(){
  if (compareWired) return;
  compareWired = true;
  cmp.aSlider.addEventListener('input', () => syncCompareFromSlider('a'));
  cmp.bSlider.addEventListener('input', () => syncCompareFromSlider('b'));
  cmp.aDate.addEventListener('change', () => syncCompareFromDateInput('a'));
  cmp.bDate.addEventListener('change', () => syncCompareFromDateInput('b'));
  cmp.periodDays.addEventListener('change', renderCompare);
  cmp.copyLink.addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).then(() => {
      cmp.copyLink.classList.add('copied');
      cmp.copyLinkText.textContent = 'Link copied';
      setTimeout(() => {
        cmp.copyLink.classList.remove('copied');
        cmp.copyLinkText.textContent = 'Copy share link';
      }, 1800);
    }).catch(() => {});
  });
}

// One-time setup once jobs.json has loaded — mirrors the former /compare/
// page's own onload handler, just triggered from this page's existing
// jobs.json fetch below instead of a second request.
function setupCompareControls(jobs){
  compareTodayDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const dates = jobs.map((r) => new Date(r.date)).filter((d) => !isNaN(d.getTime()));
  compareEarliestDate = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : addDays(compareTodayDate, -DEFAULT_PERIOD_DAYS);
  compareEarliestDate = new Date(Date.UTC(compareEarliestDate.getUTCFullYear(), compareEarliestDate.getUTCMonth(), compareEarliestDate.getUTCDate()));

  setCompareSliderRanges();
  initCompareFromUrlOrDefault();
  wireCompareEvents();
  if (currentMode === 'compare') renderCompare();
}

// Mode toggle — switches the page between the default "Latest snapshot"
// view (filter bar + stat grid + geography/workstyle/seniority sections)
// and "Compare periods" (period pickers + headline deltas + compare-rows).
// Judgement calls: #how-people-work stays visible in both modes since its
// donut+trend are chrome-only and independent of Period A/B; #geography
// is hidden in Compare mode since its single-period country bars would
// otherwise duplicate compare-rows' own "Working countries" line;
// #seniority has no Compare-mode equivalent, so it stays visible in both.
function setMode(mode, opts){
  opts = opts || {};
  currentMode = mode;
  const isCompare = mode === 'compare';

  const filterFieldEl = document.getElementById('filter-field');
  const tagFilterFormEl = document.getElementById('tag-filter-form');
  if (filterFieldEl) filterFieldEl.hidden = isCompare;
  if (filterSearchBtn) filterSearchBtn.hidden = isCompare;
  if (tagFilterFormEl) tagFilterFormEl.hidden = isCompare;
  if (statGridEl) statGridEl.hidden = isCompare;
  if (geographySectionEl) geographySectionEl.hidden = isCompare;

  if (compareControlsEl) compareControlsEl.hidden = !isCompare;
  if (compareResultsEl) compareResultsEl.hidden = !isCompare;

  if (modeToggleBtn) modeToggleBtn.textContent = isCompare ? 'Latest snapshot' : 'Compare periods';

  if (isCompare) {
    if (compareEarliestDate) renderCompare();
    if (!opts.fromUrl) updateCompareUrl();
  } else if (!opts.fromUrl) {
    history.replaceState(null, '', location.pathname);
  }
}

if (modeToggleBtn) {
  modeToggleBtn.addEventListener('click', () => {
    hideSuggestions();
    hideTagSuggestions();
    setMode(currentMode === 'compare' ? 'latest' : 'compare');
  });
}

// Enter Compare mode immediately if the URL already asks for it (e.g. a
// shared link), so the page opens straight into it instead of flashing
// Latest mode first. The actual numbers render once jobs.json arrives,
// via setupCompareControls() above.
(function initModeFromUrl(){
  const params = new URLSearchParams(location.search);
  if (params.get('compare') === '1') setMode('compare', { fromUrl: true });
})();

fetch('./data.json')
  .then((res) => { if (!res.ok) throw new Error('data.json not found'); return res.json(); })
  .then((data) => {
    render(data);
    renderTicker(data);
    statsSnapshot = { dataAsOf: data.dataAsOf, sitesConfigured: data.sitesConfigured };
  })
  .catch(() => {
    document.getElementById('asof-text').textContent = 'Stats are temporarily unavailable, check back shortly.';
  });

// Fetched independently of data.json above — a slow/failed jobs.json load
// shouldn't hold up or break the rest of the page. Feeds the trend chart,
// the country filter bar above, and (via setupCompareControls) Compare mode.
fetch('./jobs.json')
  .then((res) => { if (!res.ok) throw new Error('jobs.json not found'); return res.json(); })
  .then((jobs) => { allJobs = jobs; renderWorkStyleTrend(jobs); setupCompareControls(jobs); })
  .catch(() => {
    const note = document.getElementById('workstyle-trend-note');
    if (note) note.textContent = 'Trend data is temporarily unavailable, check back shortly.';
    if (filterInput) filterInput.placeholder = 'Filtering unavailable right now';
  });
