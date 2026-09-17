// Best-effort clickjacking guard. GitHub Pages cannot send X-Frame-Options,
// and CSP's frame-ancestors is ignored when it arrives in a <meta> tag (see
// kennethjensen-secret/framebust.js, which hit the same limit) — so a real
// response header isn't available on this host either.
//
// Unlike that file, this site is fully public with no login and no
// destructive action a clickjack could trigger, so there's no
// visibility-hidden gate here — hiding the page until confirmed top-level
// would blank it for any non-JS crawler/preview fetch, which has a real
// cost on a public marketing site and no benefit here. This just breaks
// out of a frame if it's ever loaded inside one.
(function () {
  if (window.top === window.self) return;
  try {
    window.top.location = window.self.location.href;
  } catch (e) {
    // Cross-origin frame that hasn't granted allow-top-navigation — nothing
    // more to do without a real frame-ancestors header.
  }
})();
