document.getElementById('year').textContent = new Date().getFullYear();

// Services accordion — click a row to open/close it; only ever driven by
// the .is-open class already on the first item in the markup (kept in the
// HTML directly, not set here) so the section reads correctly even if this
// script fails to load.
document.querySelectorAll('.accordion-item').forEach((item) => {
  const trigger = item.querySelector('.accordion-trigger');
  trigger.addEventListener('click', () => item.classList.toggle('is-open'));
});

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
  fetch('jobmatch/stats/data.json')
    .then((res) => res.json())
    .then((data) => {
      const total = (data.totalTracked || 0).toLocaleString('en-GB');
      const pct = data.trend && typeof data.trend.percentChange === 'number' ? data.trend.percentChange : null;
      const trendHtml = pct === null ? 'steady week on week'
        : pct > 0 ? `<span class="tk-up">&#9650; ${Math.round(pct)}%</span> from last week`
        : pct < 0 ? `<span class="tk-down">&#9660; ${Math.abs(Math.round(pct))}%</span> from last week`
        : 'flat vs last week';
      const tags = (data.tags || []).slice(0, 3).map((t) => '#' + t.value.replace(/[^a-zA-Z0-9]/g, '')).join(' ');
      const sentence = `<strong>${total}</strong> ops jobs live right now (${trendHtml})` + (tags ? `, trending skills are <span class="tk-tags">${tags}</span>` : '');
      const item = `<a class="stat-ticker-item" href="${STATS_URL}">${sentence}</a>`;
      track.innerHTML = item + item;
    })
    .catch(() => {
      track.innerHTML = `<a class="stat-ticker-item" href="${STATS_URL}">See live Nordic/Baltic operations job market stats &rarr;</a>`;
    });
})();
