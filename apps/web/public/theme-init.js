(function () {
  try {
    var root = document.documentElement;
    var pathname = globalThis.location?.pathname ?? '/';
    var isThemeEnabledRoute =
      pathname.startsWith('/app') ||
      pathname.startsWith('/onboarding') ||
      pathname.startsWith('/signin') ||
      pathname.startsWith('/signup') ||
      pathname.startsWith('/waitlist');

    var storageValue =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('jovie-theme')
        : null;

    if (isThemeEnabledRoute) {
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
      // Public/marketing routes: respect stored preference, default to dark.
      var hasStoredPref =
        storageValue === 'light' ||
        storageValue === 'dark' ||
        storageValue === 'system';

      var publicDark;
      if (hasStoredPref) {
        if (storageValue === 'system') {
          var sysDark =
            typeof globalThis.matchMedia === 'function' &&
            globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
          publicDark = sysDark;
        } else {
          publicDark = storageValue !== 'light';
        }
      } else {
        // No stored preference — default to dark
        publicDark = true;
      }

      root.classList.toggle('dark', publicDark);
      root.style.colorScheme = publicDark ? 'dark' : 'light';

      var metaThemeDark = document.querySelector('meta[name="theme-color"]');
      if (metaThemeDark) {
        metaThemeDark.setAttribute(
          'content',
          publicDark ? '#0a0a0a' : '#ffffff'
        );
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
