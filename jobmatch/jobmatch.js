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
const searchInput = document.getElementById('search-input');
const searchSubmit = document.getElementById('search-submit');
const resultsStatus = document.getElementById('results-status');
const resultsCount = document.getElementById('results-count');
const jobGrid = document.getElementById('job-grid');
const resultsEmpty = document.getElementById('results-empty');

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

async function runSearch(query) {
  searchSubmit.disabled = true;
  jobGrid.innerHTML = '';
  resultsCount.style.display = 'none';
  resultsEmpty.style.display = 'none';
  resultsStatus.style.display = 'block';
  resultsStatus.textContent = 'Loading the search model — this only happens once…';

  try {
    const [extractor, corpus] = await Promise.all([getExtractor(), loadCorpus()]);
    resultsStatus.textContent = 'Searching…';
    const output = await extractor(query, { pooling: 'mean', normalize: true });
    const queryVec = Array.from(output.data);

    const ranked = corpus
      .map((job) => ({ job, score: dot(queryVec, job.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, RESULT_LIMIT);

    resultsStatus.style.display = 'none';
    if (!ranked.length) {
      resultsEmpty.style.display = 'block';
      return;
    }
    resultsCount.style.display = 'block';
    resultsCount.textContent = `Showing top ${ranked.length} match${ranked.length === 1 ? '' : 'es'}.`;
    for (const { job } of ranked) jobGrid.appendChild(renderJobCard(job));
  } catch (err) {
    resultsStatus.style.display = 'block';
    resultsStatus.textContent = 'Search is temporarily unavailable, check back shortly.';
  } finally {
    searchSubmit.disabled = false;
  }
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (query) runSearch(query);
});
