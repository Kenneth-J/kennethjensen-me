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

function barRow(label, count, widthPercent, valueText, muted){
  const row = document.createElement('div');
  row.className = 'bar-row';
  row.innerHTML =
    '<span class="bar-label">' + esc(label) + '</span>' +
    '<span class="bar-track"><span class="bar-fill' + (muted ? ' muted' : '') + '" style="width:' + esc(widthPercent) + '%"></span></span>' +
    '<span class="bar-value num">' + esc(valueText) + '</span>';
  return row;
}

function render(data){
  const asofEl = document.getElementById('asof-text');
  asofEl.textContent = data.totalTracked + ' open role' + (data.totalTracked === 1 ? '' : 's') + ' tracked · data as of ' + fmtDate(data.dataAsOf);

  // Stat grid
  const grid = document.getElementById('stat-grid');
  const trend = data.trend;
  const trendUp = trend.percentChange !== null && trend.percentChange > 0;
  const trendDown = trend.percentChange !== null && trend.percentChange < 0;
  const trendText = trend.percentChange === null
    ? trend.currentCount + ' new (no prior week to compare)'
    : (trendUp ? '+' : '') + trend.percentChange.toFixed(0) + '% vs ' + fmtInt(trend.previousCount) + ' last week';

  const topCountry = data.countries[0];
  const topCountryShare = topCountry && data.totalTracked ? Math.round((topCountry.count / data.totalTracked) * 100) : null;

  grid.appendChild(statCard(fmtInt(data.totalTracked), null, 'Open roles tracked', 'across ' + fmtCount(data.sourceSites.length, 'site') + ' with matches so far'));
  grid.appendChild(statCard(fmtInt(trend.currentCount), null, 'Posted this week', trendText, trendUp ? 'up' : (trendDown ? 'down' : '')));
  grid.appendChild(statCard(
    topCountry ? fmtInt(topCountry.count) : '-',
    null,
    topCountry ? topCountry.value + ' leads' : 'No location data yet',
    topCountryShare !== null ? topCountryShare + '% of all tracked roles' : ''
  ));
  grid.appendChild(statCard(fmtInt(data.sitesConfigured || data.sourceSites.length), null, 'Sites monitored', 'checked every second day'));

  // Country bars
  const countryBars = document.getElementById('country-bars');
  const countryTotal = data.totalTracked || 1;
  data.countries.forEach((c) => {
    countryBars.appendChild(barRow(c.value, c.count, Math.max(2, (c.count / countryTotal) * 100), fmtInt(c.count) + ' · ' + Math.round((c.count / countryTotal) * 100) + '%'));
  });
  if (data.unlocatedCount > 0) {
    countryBars.appendChild(barRow('Not yet placed', data.unlocatedCount, Math.max(2, (data.unlocatedCount / countryTotal) * 100), fmtInt(data.unlocatedCount) + ' · ' + Math.round((data.unlocatedCount / countryTotal) * 100) + '%', true));
  }
  if (data.countries.length === 0 && data.unlocatedCount === 0) {
    countryBars.innerHTML = '<p class="empty-state">No roles tracked yet.</p>';
  }

  renderWorkStyleDonut(data);

  // Seniority ladder bars — fixed Entry → C-Level order (see SENIORITY_TIERS)
  const seniorityBars = document.getElementById('seniority-bars');
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
// see the donut's own center label and the section's lede paragraph.
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

// Sunday-anchored week bucket, same convention as compare.js's own date
// handling on this same page family — keeps "which week is this row in"
// consistent if the two ever need to agree on one.
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
// dates data.json doesn't carry — same file the Compare page already
// relies on, no new export needed.
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
  note.textContent = `Last ${points.length} weeks with tracked postings — latest week: ${fmtInt(last.onsite)} on-site, ${fmtInt(last.remoteHybrid)} remote/hybrid.`;
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

fetch('./data.json')
  .then((res) => { if (!res.ok) throw new Error('data.json not found'); return res.json(); })
  .then((data) => { render(data); renderTicker(data); })
  .catch(() => {
    document.getElementById('asof-text').textContent = 'Stats are temporarily unavailable, check back shortly.';
  });

// Fetched independently of data.json above — a slow/failed jobs.json load
// shouldn't hold up or break the rest of the page, it only feeds the one
// trend chart.
fetch('./jobs.json')
  .then((res) => { if (!res.ok) throw new Error('jobs.json not found'); return res.json(); })
  .then((jobs) => renderWorkStyleTrend(jobs))
  .catch(() => {
    const note = document.getElementById('workstyle-trend-note');
    if (note) note.textContent = 'Trend data is temporarily unavailable, check back shortly.';
  });
