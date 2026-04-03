(function () {
  try {
    var root = document.documentElement;
    var pathname = globalThis.location?.pathname ?? '/';
    var segments = pathname.split('/').filter(Boolean);
    var firstSegment = segments[0] ?? '';
    var publicRouteThemeExclusions = {
      '.well-known': true,
      about: true,
      account: true,
      actions: true,
      ai: true,
      alternatives: true,
      api: true,
      app: true,
      'artist-profiles': true,
      'artist-selection': true,
      artists: true,
      billing: true,
      blog: true,
      changelog: true,
      claim: true,
      compare: true,
      demo: true,
      'engagement-engine': true,
      error: true,
      go: true,
      hud: true,
      'investor-portal': true,
      investors: true,
      launch: true,
      legal: true,
      'llms-full.txt': true,
      'llms.txt': true,
      new: true,
      onboarding: true,
      pricing: true,
      signin: true,
      signup: true,
      support: true,
      tips: true,
      ui: true,
      waitlist: true,
    };
    var isPublicProfileRoute =
      !!firstSegment && !publicRouteThemeExclusions[firstSegment];
    var isThemeEnabledRoute =
      pathname.startsWith('/app') ||
      pathname.startsWith('/onboarding') ||
      pathname.startsWith('/signin') ||
      pathname.startsWith('/signup') ||
      pathname.startsWith('/waitlist') ||
      isPublicProfileRoute;

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
          : isPublicProfileRoute
            ? 'system'
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
      // Public/marketing routes: always dark — the design system assumes dark mode.
      // Ignoring stored preference prevents hybrid light/dark rendering since the
      // marketing layout hardcodes a .dark ancestor class.
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
