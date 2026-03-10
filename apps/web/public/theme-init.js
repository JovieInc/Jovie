(function () {
  try {
    var root = document.documentElement;
    root.classList.add('dark');

    // Persist dark theme to avoid hydration mismatch with next-themes.
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('jovie-theme', 'dark');
    }

    // Update theme-color meta tag to match active theme (PWA system bar color)
    var themeColor = '#0a0a0a';
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', themeColor);

    // High contrast mode (independent of light/dark)
    var hc = localStorage.getItem('jovie-high-contrast');
    if (hc === 'true') root.classList.add('high-contrast');
    else root.classList.remove('high-contrast');
  } catch {
    // Theme detection failed - defaults will apply
  }
})();
