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

  // Work style chips
  const chips = document.getElementById('workstyle-chips');
  const classifiedWorkStyle = data.workStyle.reduce((sum, w) => sum + w.count, 0);
  const unclassifiedWorkStyle = data.totalTracked - classifiedWorkStyle;
  if (data.workStyle.length === 0) {
    chips.innerHTML = '<p class="empty-state">Not enough roles have a work style noted yet.</p>';
  } else {
    data.workStyle.forEach((w) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = '<b>' + fmtInt(w.count) + '</b> ' + esc(String(w.value).toLowerCase());
      chips.appendChild(chip);
    });
    if (unclassifiedWorkStyle > 0) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = '<b>' + fmtInt(unclassifiedWorkStyle) + '</b> not noted';
      chips.appendChild(chip);
    }
  }

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
