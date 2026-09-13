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
// Colors are loosely flag-inspired, for quick visual recognition rather
// than exact national-color accuracy; `bg` is `text` mixed ~14% into
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
  { value: 'Baltic', aliases: ['baltic', 'baltics'], text: '#6c757d', bg: '#eaeced' },
  { value: 'Remote', aliases: ['remote'], text: '#1a8a5f', bg: '#dfefe9' },
];
const MIN_TOKEN_LENGTH = 2; // "d" alone matches too much (Denmark, Danmark...) to be a useful suggestion yet

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
  if (token.length < MIN_TOKEN_LENGTH) {
    hideSuggestions();
    return;
  }
  const matches = COUNTRIES.filter(
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
// (search-data.json, written by src/search.js) are already L2-normalized —
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

async function runSearch(query, countries) {
  searchSubmit.disabled = true;
  jobGrid.innerHTML = '';
  resultsCount.style.display = 'none';
  resultsEmpty.style.display = 'none';
  resultsStatus.style.display = 'block';
  resultsStatus.textContent = 'Loading the search model — this only happens once…';

  try {
    const corpus = await loadCorpus();
    const candidates = countries.length ? corpus.filter((job) => countries.includes(job.country)) : corpus;

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
      // Country tag(s) only, no free text — nothing to rank by relevance,
      // so most-recently-posted first is the sensible default instead
      // (and there's no meaningful "relevance" for a divider to mark).
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
  const query = searchInput.value.trim();
  if (query || selectedCountries.length) runSearch(query, selectedCountries.slice());
});
