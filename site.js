document.getElementById('year').textContent = new Date().getFullYear();

// Services accordion — click a row to open/close it; only ever driven by
// the .is-open class already on the first item in the markup (kept in the
// HTML directly, not set here) so the section reads correctly even if this
// script fails to load.
document.querySelectorAll('.accordion-item').forEach((item) => {
  const trigger = item.querySelector('.accordion-trigger');
  trigger.addEventListener('click', () => item.classList.toggle('is-open'));
});

// Mobile menu — the desktop Services panel only opens on :hover, which
// doesn't work on touch, so this is a separate click-toggled panel (see
// index.html's own comment on .mobile-menu for why it's always in the DOM
// rather than hidden/shown).
(() => {
  const hamburger = document.getElementById('nav-hamburger');
  const menu = document.getElementById('mobile-menu');
  if (!hamburger || !menu) return;

  function closeMenu() {
    hamburger.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
  }
  function toggleMenu() {
    const isOpen = hamburger.getAttribute('aria-expanded') === 'true';
    hamburger.setAttribute('aria-expanded', String(!isOpen));
    menu.classList.toggle('is-open', !isOpen);
  }

  hamburger.addEventListener('click', toggleMenu);
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !hamburger.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  // A resize past the mobile breakpoint (rotating a tablet, say) shouldn't
  // leave the panel open-but-invisible underneath the now-visible desktop
  // nav — matches this page's own 860px breakpoint.
  window.addEventListener('resize', () => { if (window.innerWidth > 860) closeMenu(); });
})();

// Hero headline crossfade — cycles the closing phrase after "20+ years
// turning operations", inspired by the rotating tagline on the reference
// site. The first phrase is marked .is-active directly in the HTML so it
// renders correctly with no JS at all; this only adds the cycling on top.
(() => {
  const rotator = document.getElementById('hero-rotator');
  if (!rotator) return;
  const phrases = Array.from(rotator.children);
  if (phrases.length < 2) return;
  let index = 0;
  setInterval(() => {
    phrases[index].classList.remove('is-active');
    index = (index + 1) % phrases.length;
    phrases[index].classList.add('is-active');
  }, 3200);
})();

// Top stat ticker — pulls live headline numbers from the JobMatch scraper's
// public stats export so it never drifts out of sync with the stats page.
(() => {
  const track = document.getElementById('stat-ticker-track');
  if (!track) return;
  const STATS_URL = 'https://kennethjensen.me/jobmatch/stats/';

  // Flattening tags: the 3 tags with the biggest week-over-week drop in
  // count, as a red-toned counterpart to "trending" (data.json's tags,
  // sorted by raw current count). Needs jobs.json (per-row, dated) rather
  // than the pre-aggregated data.json — same file the Stats page's own
  // trend chart already relies on, fetched fresh here since the
  // homepage doesn't otherwise load it. A rolling 7-day-vs-previous-7-day
  // window (not calendar-week-aligned), so there's no partial-current-week
  // artefact, same convention as data.json's own top-level trend field.
  // excludeTags: the tags already shown as trending — a high-volume tag can
  // legitimately be both "most common overall" and "biggest raw decline"
  // (its scale alone makes for a big absolute delta), which read as a
  // contradiction sitting side by side in the same sentence, so trending
  // tags are never eligible to also show up as flattening.
  function flatteningTags(jobs, excludeTags) {
    const now = Date.now();
    const thisWeek = {};
    const lastWeek = {};
    jobs.forEach((r) => {
      const d = new Date(r.date).getTime();
      if (isNaN(d)) return;
      const bucket = d >= now - 7 * 86400000 && d < now ? thisWeek
        : d >= now - 14 * 86400000 && d < now - 7 * 86400000 ? lastWeek
        : null;
      if (!bucket) return;
      (r.tags || []).forEach((tag) => { bucket[tag] = (bucket[tag] || 0) + 1; });
    });
    const allTags = new Set([...Object.keys(thisWeek), ...Object.keys(lastWeek)]);
    return Array.from(allTags)
      .filter((tag) => !excludeTags.includes(tag))
      .map((tag) => ({ tag, delta: (thisWeek[tag] || 0) - (lastWeek[tag] || 0) }))
      .filter((t) => t.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 3)
      .map((t) => t.tag);
  }

  Promise.all([
    fetch('jobmatch/stats/data.json').then((res) => res.json()),
    // Non-fatal if this one fails — the ticker's main content still
    // renders without a "flattening" clause rather than the whole thing
    // falling back to the generic link.
    fetch('jobmatch/stats/jobs.json').then((res) => res.json()).catch(() => null),
  ])
    .then(([data, jobs]) => {
      const total = (data.totalTracked || 0).toLocaleString('en-GB');
      const pct = data.trend && typeof data.trend.percentChange === 'number' ? data.trend.percentChange : null;
      const trendHtml = pct === null ? 'steady week on week'
        : pct > 0 ? `<span class="tk-up">&#9650; ${Math.round(pct)}%</span> from last week`
        : pct < 0 ? `<span class="tk-down">&#9660; ${Math.abs(Math.round(pct))}%</span> from last week`
        : 'flat vs last week';
      const trendingTagValues = (data.tags || []).slice(0, 3).map((t) => t.value);
      const trendingTags = trendingTagValues.map((v) => `<span class="tk-tag">#${v.replace(/[^a-zA-Z0-9]/g, '')}</span>`).join('');
      const flattening = jobs ? flatteningTags(jobs, trendingTagValues) : [];
      const flatteningTagsHtml = flattening.map((tag) => `<span class="tk-tag tk-tag-down">#${tag.replace(/[^a-zA-Z0-9]/g, '')}</span>`).join('');
      const sentence = `<strong>${total}</strong> ops jobs live right now (${trendHtml})`
        + (trendingTags ? `, trending skills are <span class="tk-tags">${trendingTags}</span>` : '')
        + (flatteningTagsHtml ? `, flattening: <span class="tk-tags">${flatteningTagsHtml}</span>` : '');
      const item = `<a class="stat-ticker-item" href="${STATS_URL}">${sentence}</a><span class="stat-ticker-sep" aria-hidden="true">&#9679;</span>`;
      track.innerHTML = item + item;
    })
    .catch(() => {
      track.innerHTML = `<a class="stat-ticker-item" href="${STATS_URL}">See live Nordic/Baltic operations job market stats &rarr;</a>`;
    });
})();
