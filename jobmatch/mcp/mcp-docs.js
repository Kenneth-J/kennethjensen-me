document.getElementById('year').textContent = new Date().getFullYear();

// Top stat ticker — same self-contained fetch every other JobMatch page
// uses (see jobmatch.js/stats.js's own copy), just pointed one directory
// further up at stats/data.json from here.
(() => {
  const track = document.getElementById('stat-ticker-track');
  if (!track) return;
  const STATS_URL = 'https://kennethjensen.me/jobmatch/stats/';
  fetch('../stats/data.json')
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

// Copy buttons — the hero endpoint pill and every code block's own button.
// Falls back to a visible "select the text" prompt if the Clipboard API
// is unavailable (e.g. non-secure context), rather than failing silently.
document.querySelectorAll('[data-copy-target]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const target = document.getElementById(btn.dataset.copyTarget);
    if (!target) return;
    const text = target.textContent;
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
      btn.classList.add('copied');
    } catch {
      btn.textContent = 'Select & copy';
    }
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1800);
  });
});

// Active-section highlighting in the sidebar (and mobile pill row) as the
// reader scrolls — same idea as any "classical" docs site's left nav.
(() => {
  const links = Array.from(document.querySelectorAll('.docs-nav a[href^="#"]'));
  if (!links.length) return;
  const linkFor = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const sections = Array.from(linkFor.keys())
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((a) => a.classList.remove('active'));
        const link = linkFor.get(entry.target.id);
        if (link) {
          link.classList.add('active');
          if (link.scrollIntoView) link.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
      }
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
  );
  sections.forEach((section) => observer.observe(section));
})();
