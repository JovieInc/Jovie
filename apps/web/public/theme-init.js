(function () {
  try {
    var root = document.documentElement;
    var isLocalDev =
      globalThis.location &&
      (globalThis.location.hostname === 'localhost' ||
        globalThis.location.hostname === '127.0.0.1');
    var storedTheme =
      typeof localStorage !== 'undefined' && localStorage
        ? localStorage.getItem('jovie-theme')
        : null;
    var nextTheme =
      isLocalDev && (storedTheme === 'light' || storedTheme === 'dark')
        ? storedTheme
        : 'dark';

    root.classList.remove('light', 'dark');
    root.classList.add(nextTheme);

    // Update theme-color meta tag for PWA system bar color
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute(
        'content',
        nextTheme === 'light' ? '#f7f8f9' : '#0a0a0a'
      );
    }

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
