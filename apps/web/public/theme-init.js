(function () {
  try {
    var root = document.documentElement;
    var pathname = globalThis.location?.pathname ?? '/';
    var isThemeEnabledRoute =
      pathname.startsWith('/app') || pathname.startsWith('/onboarding');

    if (isThemeEnabledRoute) {
      var storageValue =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('jovie-theme')
          : null;
      var theme =
        storageValue === 'light' ||
        storageValue === 'dark' ||
        storageValue === 'system'
          ? storageValue
          : 'system';

      var systemPrefersDark =
        typeof globalThis.matchMedia === 'function' &&
        globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
      var resolvedDark =
        theme === 'dark' || (theme === 'system' && systemPrefersDark);

      root.classList.toggle('dark', resolvedDark);
      root.style.colorScheme = resolvedDark ? 'dark' : 'light';

      var metaThemeEnabled = document.querySelector('meta[name="theme-color"]');
      if (metaThemeEnabled) {
        metaThemeEnabled.setAttribute(
          'content',
          resolvedDark ? '#0a0a0a' : '#ffffff'
        );
      }
    } else {
      // Public surfaces are intentionally forced dark.
      root.classList.add('dark');
      root.style.colorScheme = 'dark';

      var metaThemeDark = document.querySelector('meta[name="theme-color"]');
      if (metaThemeDark) {
        metaThemeDark.setAttribute('content', '#0a0a0a');
      }
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
