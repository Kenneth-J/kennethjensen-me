document.getElementById('year').textContent = new Date().getFullYear();

// search-data.json is built by the scraper from third-party job listings —
// every field on a job card is untrusted input. Same escaping convention
// already established on this site's stats page (jobmatch/stats/stats.js),
// not the DOM-based version used in the (separate, password-gated)
// secret.kennethjensen.me admin panel — kept consistent within this repo.
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const WORKER_URL = 'https://jobmatch-worker.kennethj.workers.dev';
const RESULT_LIMIT = 30;

const searchForm = document.getElementById('search-form');
const searchField = document.getElementById('search-field');
const searchInput = document.getElementById('search-input');
const searchSubmit = document.getElementById('search-submit');
const countryTagsEl = document.getElementById('country-tags');
const countryTagsLabelEl = document.getElementById('country-tags-label');
const countrySuggestionsEl = document.getElementById('country-suggestions');
const resultsStatus = document.getElementById('results-status');
const resultsCount = document.getElementById('results-count');
const jobGrid = document.getElementById('job-grid');
const resultsEmpty = document.getElementById('results-empty');

// Matches search-data.json's own `country` values (src/search.js selects
// "Working Country" straight off Baserow, so these are exactly that
// field's own option list — see jobmatch-worker's WORKING_COUNTRY_OPTIONS).
// `aliases` are what a visitor might actually type — English name, native
// name(s), common alternate spellings — matched as a prefix against the
// last word being typed, case/diacritic-insensitive (see normalizeToken()).
// Colours are loosely flag-inspired, for quick visual recognition rather
// than exact national-colour accuracy; `bg` is `text` mixed ~14% into
// white, same tint ratio as this site's other soft-accent pills.
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
  { value: 'Remote', aliases: ['remote'], text: '#1a8a5f', bg: '#dfefe9' },
];

// Selected country filters — an array of COUNTRIES[].value strings, applied
// as a hard filter (job.country must be one of these) before ranking,
// entirely separate from the free-text query used for semantic search.
let selectedCountries = [];

function normalizeToken(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // strip diacritics so "ísland"/"island" both match "island"
}

// The word the user is currently mid-typing — text after the last space,
// so "warehouse manager de" still offers Denmark without the earlier words
// interfering, same as any standard tag/chip combobox.
function currentToken(value) {
  const parts = value.split(/\s+/);
  return parts[parts.length - 1] || '';
}

function renderCountryTags() {
  countryTagsEl.innerHTML = '';
  countryTagsLabelEl.hidden = selectedCountries.length === 0;
  for (const value of selectedCountries) {
    const country = COUNTRIES.find((c) => c.value === value);
    if (!country) continue;
    const tag = document.createElement('span');
    tag.className = 'country-tag';
    tag.style.background = country.bg;
    tag.style.color = country.text;
    tag.innerHTML = `${esc(country.value)} <button type="button" aria-label="Remove ${esc(country.value)} filter">&times;</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      selectedCountries = selectedCountries.filter((v) => v !== value);
      renderCountryTags();
      searchInput.focus();
    });
    countryTagsEl.appendChild(tag);
  }
}

function selectCountry(value) {
  if (!selectedCountries.includes(value)) selectedCountries.push(value);
  // Drop the just-typed token that triggered this suggestion — it's now a
  // structured filter, not part of the free-text query.
  const parts = searchInput.value.split(/\s+/);
  parts.pop();
  searchInput.value = parts.join(' ');
  renderCountryTags();
  hideSuggestions();
  searchInput.focus();
}

function hideSuggestions() {
  countrySuggestionsEl.hidden = true;
  countrySuggestionsEl.innerHTML = '';
}

function updateSuggestions() {
  const token = normalizeToken(currentToken(searchInput.value));
  // Empty token (nothing typed yet, e.g. right after focusing the box)
  // shows every unselected country rather than hiding — same list a click
  // on a native <select> would open.
  const matches =
    token.length === 0
      ? COUNTRIES.filter((c) => !selectedCountries.includes(c.value))
      : COUNTRIES.filter(
          (c) => !selectedCountries.includes(c.value) && c.aliases.some((a) => normalizeToken(a).startsWith(token))
        );
  if (!matches.length) {
    hideSuggestions();
    return;
  }
  countrySuggestionsEl.innerHTML = '';
  for (const country of matches) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'country-suggestion';
    btn.style.background = country.bg;
    btn.style.color = country.text;
    btn.textContent = country.value;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus on the input rather than the button, avoids a blur/hide race
      selectCountry(country.value);
    });
    countrySuggestionsEl.appendChild(btn);
  }
  countrySuggestionsEl.hidden = false;
}

searchInput.addEventListener('input', updateSuggestions);
searchInput.addEventListener('focus', updateSuggestions);
searchInput.addEventListener('keydown', (e) => {
  // Enter/Tab while a suggestion is showing confirms the first (only
  // realistic case in practice — country name prefixes rarely collide)
  // instead of submitting the form or moving focus away.
  if ((e.key === 'Enter' || e.key === 'Tab') && !countrySuggestionsEl.hidden) {
    const first = countrySuggestionsEl.querySelector('.country-suggestion');
    if (first) {
      e.preventDefault();
      first.dispatchEvent(new Event('mousedown', { cancelable: true }));
    }
  }
  if (e.key === 'Escape') hideSuggestions();
});
document.addEventListener('click', (e) => {
  if (!searchField.contains(e.target) && !countrySuggestionsEl.contains(e.target)) hideSuggestions();
});

// Tag filter — same pill/autocomplete pattern as the country tags above,
// plus an Include/Exclude mode covering the whole selected set (not
// per-tag): "only jobs with any of these" vs "no jobs with any of these".
// Lives outside <form id="search-form"> as its own control (its Enter key
// doesn't submit anything), and its selection is read by the search
// form's own submit handler below — same "trigger on submit, not
// per-keystroke" rule as the free-text query itself.
let selectedTags = [];
let tagFilterMode = 'include';

const tagFilterInput = document.getElementById('tag-filter-input');
const tagFilterTagsEl = document.getElementById('tag-filter-tags');
const tagFilterTagsLabelEl = document.getElementById('tag-filter-tags-label');
const tagFilterSuggestionsEl = document.getElementById('tag-filter-suggestions');
const tagFilterModeEl = document.getElementById('tag-filter-mode');

function allTagsSortedByCount(corpus) {
  const counts = new Map();
  corpus.forEach((job) => (job.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a));
}

function renderTagFilterTags() {
  tagFilterTagsEl.innerHTML = '';
  tagFilterTagsLabelEl.hidden = selectedTags.length === 0;
  tagFilterTagsLabelEl.textContent = tagFilterMode === 'include' ? 'Must have:' : 'Must not have:';
  for (const tag of selectedTags) {
    const el = document.createElement('span');
    el.className = 'country-tag';
    el.style.background = tagFilterMode === 'include' ? 'var(--bg-alt)' : '#f6e3e1';
    el.style.color = tagFilterMode === 'include' ? 'var(--ink)' : '#c0392b';
    el.innerHTML = `${esc(tag)} <button type="button" aria-label="Remove ${esc(tag)} filter">&times;</button>`;
    el.querySelector('button').addEventListener('click', () => {
      selectedTags = selectedTags.filter((v) => v !== tag);
      renderTagFilterTags();
      tagFilterInput.focus();
    });
    tagFilterTagsEl.appendChild(el);
  }
}

function hideTagSuggestions() {
  tagFilterSuggestionsEl.hidden = true;
  tagFilterSuggestionsEl.innerHTML = '';
}

// loadCorpus() is the same lazy, memoized fetch runSearch() uses — cheap
// (a JSON fetch, not the ~25MB embedding model), so pulling it in on first
// focus of this filter (rather than waiting for an actual search) is an
// acceptable eagerness trade for populating tag suggestions.
async function showTagSuggestions(query) {
  let corpus;
  try {
    corpus = await loadCorpus();
  } catch {
    return;
  }
  const token = normalizeToken(query);
  const matches = allTagsSortedByCount(corpus).filter(
    (t) => !selectedTags.includes(t) && (token === '' || normalizeToken(t).startsWith(token))
  );
  if (!matches.length) {
    hideTagSuggestions();
    return;
  }
  tagFilterSuggestionsEl.innerHTML = '';
  for (const tag of matches) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'country-suggestion';
    btn.style.background = 'var(--bg-alt)';
    btn.style.color = 'var(--ink)';
    btn.textContent = tag;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus on the input rather than the button, avoids a blur/hide race
      selectFilterTag(tag);
    });
    tagFilterSuggestionsEl.appendChild(btn);
  }
  tagFilterSuggestionsEl.hidden = false;
}

function selectFilterTag(tag) {
  if (!selectedTags.includes(tag)) selectedTags.push(tag);
  tagFilterInput.value = '';
  tagFilterInput.focus();
  renderTagFilterTags();
  hideTagSuggestions();
}

if (tagFilterModeEl) {
  tagFilterModeEl.querySelectorAll('.tag-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === tagFilterMode) return;
      tagFilterMode = btn.dataset.mode;
      tagFilterModeEl.querySelectorAll('.tag-mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderTagFilterTags();
    });
  });
}

tagFilterInput.addEventListener('input', () => showTagSuggestions(tagFilterInput.value));
tagFilterInput.addEventListener('focus', () => showTagSuggestions(tagFilterInput.value));
tagFilterInput.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace' && tagFilterInput.value === '' && selectedTags.length > 0) {
    selectedTags = selectedTags.slice(0, -1);
    renderTagFilterTags();
  } else if (e.key === 'Escape') {
    hideTagSuggestions();
  }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#tag-filter-form')) hideTagSuggestions();
});

// Loaded lazily, on first search, not eagerly on page load — a visitor who
// never searches shouldn't pay the ~25MB model download at all. Memoizing
// the promise means a second search reuses the already-loaded model
// instead of re-fetching it. Must stay in lockstep with the scraper's own
// src/embeddings.js: identical model id and pooling/normalize options, or
// this page's query vectors and search-data.json's job vectors stop being
// comparable by cosine similarity without either side erroring.
let extractorPromise = null;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0').then(({ pipeline }) =>
      pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    );
  }
  return extractorPromise;
}

let corpusPromise = null;
function loadCorpus() {
  if (!corpusPromise) {
    corpusPromise = fetch('./search-data.json').then((res) => {
      if (!res.ok) throw new Error('search-data.json not found');
      return res.json();
    });
    corpusPromise.catch(() => {
      corpusPromise = null; // allow a retry on the next search rather than caching a failure forever
    });
  }
  return corpusPromise;
}

// Both the query vector (below) and every job's stored embedding
// (search-data.json, written by src/search.js) are already L2-normalised —
// normalize: true on both sides — so a plain dot product already IS cosine
// similarity here; no separate magnitude division needed.
function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Where to split "best matches" from "other matches you might also
// consider," so a handful of weak results padding out the count doesn't
// read as equally confident as the top ones. Calibrated 2026-09-13 against
// real cosine-similarity scores from four live queries against the actual
// corpus: a specific, well-matched query (0.65 down to 0.54, decays
// smoothly, no split warranted), a vague one ("venue danmark": 0.34 down
// to 0.20, a real quality drop after rank 2), a broad-but-real one (0.60
// down to 0.50, smooth again), and a nonsense query (0.14–0.20, uniformly
// weak throughout). Two independent triggers, whichever fires at the
// earlier rank:
//   - ABSOLUTE_FLOOR: a specific, well-matched query never dips below ~0.5
//     across all 30 results; a loosely-matched one falls under 0.3 by
//     rank 3. Below this floor, a result probably shares vocabulary with
//     the query more than it shares real relevance.
//   - RELATIVE_GAP: catches a sharp one-off drop even above the floor (a
//     single standout match followed by markedly weaker ones).
// Clamped to a minimum split of 1 (never 0) — rank 1 is always shown
// unconditionally, even for a query where nothing matches well; there is
// no case where showing literally zero "best" results is more useful than
// showing the single closest one.
const RELEVANCE_ABSOLUTE_FLOOR = 0.3;
const RELEVANCE_RELATIVE_GAP = 0.05;

function findRelevanceDividerIndex(ranked) {
  let floorIndex = -1;
  let gapIndex = -1;
  for (let i = 0; i < ranked.length; i++) {
    if (floorIndex === -1 && ranked[i].score < RELEVANCE_ABSOLUTE_FLOOR) floorIndex = i;
    if (i > 0 && gapIndex === -1 && ranked[i - 1].score - ranked[i].score >= RELEVANCE_RELATIVE_GAP) gapIndex = i;
  }
  const candidates = [floorIndex, gapIndex].filter((i) => i !== -1);
  if (!candidates.length) return -1;
  return Math.max(1, Math.min(...candidates));
}

// Fire-and-forget: lets Kenneth see which existing Tags real search demand
// is hitting, and which frequent, non-tag search terms are candidates for a
// new Tag (see jobmatch-worker's /search/terms, viewed from the admin panel
// at secret.kennethjensen.me). Never awaited by runSearch() and any failure
// is swallowed — logging a search must never slow down or break showing
// results for it.
function logSearch(query, resultCount) {
  fetch(`${WORKER_URL}/search/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, resultCount }),
    keepalive: true,
  }).catch(() => {});
}

function formatSalary(job) {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const currency = job.currency || '';
  const fmt = (n) => n.toLocaleString('en-US');
  if (job.salaryMin != null && job.salaryMax != null && job.salaryMin !== job.salaryMax) {
    return `${fmt(job.salaryMin)}–${fmt(job.salaryMax)} ${currency}`.trim();
  }
  return `${fmt(job.salaryMin ?? job.salaryMax)} ${currency}`.trim();
}

// Apply links route through jobmatch-worker's existing, already-public,
// already-hardened /go/<id> redirect rather than any raw scraped URL — this
// page never handles a raw job URL at all (search-data.json deliberately
// doesn't include one, only the Baserow row id), so there's no scheme/host
// to validate here; the worker does that server-side against its own
// stored copy of the URL.
function renderJobCard(job) {
  const a = document.createElement('a');
  a.className = 'job-card';
  a.href = `${WORKER_URL}/go/${encodeURIComponent(job.id)}`;
  a.target = '_blank';
  a.rel = 'noopener';

  const metaParts = [job.company, job.location, job.sourceSite].filter(Boolean);
  const salary = formatSalary(job);
  const tags = job.tags || [];

  a.innerHTML =
    `<h3>${esc(job.jobTitle || '(untitled)')}</h3>` +
    `<p class="job-meta">${metaParts.map((p) => `<span>${esc(p)}</span>`).join('')}</p>` +
    (salary ? `<p class="job-salary">${esc(salary)}</p>` : '') +
    (tags.length ? `<div class="job-tags">${tags.map((t) => `<span class="job-tag">${esc(t)}</span>`).join('')}</div>` : '');
  return a;
}

function renderDivider() {
  const div = document.createElement('div');
  div.className = 'results-divider';
  div.textContent = 'Other matches, less closely related';
  return div;
}

async function runSearch(query, countries, tags, tagMode) {
  searchSubmit.disabled = true;
  jobGrid.innerHTML = '';
  resultsCount.style.display = 'none';
  resultsEmpty.style.display = 'none';
  resultsStatus.style.display = 'block';
  resultsStatus.textContent = 'Loading the search model, this only happens once…';

  try {
    const corpus = await loadCorpus();
    // "Remote" is a pill in the same row as the real countries, but it isn't
    // one of job.country's own values — a fully remote job gets
    // country: null there by design (see jobmatch's filter.js detectLocation()
    // comment: remoteness and geography are deliberately not conflated), so
    // it's matched against job.remoteType instead, the field that actually
    // carries it.
    const candidates = corpus.filter((job) => {
      const countryOk =
        !countries.length || countries.includes(job.country) || (countries.includes('Remote') && job.remoteType === 'Remote');
      if (!countryOk) return false;
      if (tags && tags.length) {
        const hasAnyTag = (job.tags || []).some((t) => tags.includes(t));
        if (tagMode === 'exclude' ? hasAnyTag : !hasAnyTag) return false;
      }
      return true;
    });

    let ranked;
    let dividerIndex = -1;
    if (query) {
      const extractor = await getExtractor();
      resultsStatus.textContent = 'Searching…';
      const output = await extractor(query, { pooling: 'mean', normalize: true });
      const queryVec = Array.from(output.data);
      ranked = candidates
        .map((job) => ({ job, score: dot(queryVec, job.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, RESULT_LIMIT);
      dividerIndex = findRelevanceDividerIndex(ranked);
    } else {
      // Country/tag filters only, no free text — nothing to rank by
      // relevance, so most-recently-posted first is the sensible default
      // instead (and there's no meaningful "relevance" for a divider to mark).
      ranked = candidates
        .filter((job) => job.datePosted)
        .sort((a, b) => new Date(b.datePosted) - new Date(a.datePosted))
        .slice(0, RESULT_LIMIT)
        .map((job) => ({ job, score: null }));
    }

    logSearch(query, ranked.length);

    resultsStatus.style.display = 'none';
    if (!ranked.length) {
      resultsEmpty.style.display = 'block';
      return;
    }
    resultsCount.style.display = 'block';
    resultsCount.textContent = `Showing top ${ranked.length} match${ranked.length === 1 ? '' : 'es'}.`;
    ranked.forEach(({ job }, i) => {
      if (i === dividerIndex) jobGrid.appendChild(renderDivider());
      jobGrid.appendChild(renderJobCard(job));
    });
  } catch (err) {
    resultsStatus.style.display = 'block';
    resultsStatus.textContent = 'Search is temporarily unavailable, check back shortly.';
  } finally {
    searchSubmit.disabled = false;
  }
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  hideSuggestions();
  hideTagSuggestions();
  const query = searchInput.value.trim();
  if (query || selectedCountries.length || selectedTags.length) {
    runSearch(query, selectedCountries.slice(), selectedTags.slice(), tagFilterMode);
  }
});

// Top stat ticker — pulls live headline numbers from the JobMatch scraper's
// public stats export so it never drifts out of sync with the stats page.
(() => {
  const track = document.getElementById('stat-ticker-track');
  if (!track) return;
  const STATS_URL = 'https://kennethjensen.me/jobmatch/stats/';
  fetch('stats/data.json')
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
