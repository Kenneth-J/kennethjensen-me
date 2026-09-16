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
