(function () {
  try {
    // Force dark mode app-wide (JOV-1479). Light mode disabled until further notice.
    var root = document.documentElement;
    root.classList.add('dark');

    // Update theme-color meta tag for PWA system bar color
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', '#0a0a0a');

    // High contrast mode (independent of light/dark)
    if (typeof localStorage !== 'undefined' && localStorage) {
      var hc = localStorage.getItem('jovie-high-contrast');
      if (hc === 'true') root.classList.add('high-contrast');
      else root.classList.remove('high-contrast');
    }
  } catch {
    // Theme detection failed - defaults will apply
  }
})();
