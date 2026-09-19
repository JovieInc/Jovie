(function () {
  try {
    var root = document.documentElement;
    var pathname = globalThis.location?.pathname ?? '/';
    var policyNode = document.getElementById('jovie-theme-route-policy');
    var policy = policyNode?.textContent
      ? JSON.parse(policyNode.textContent)
      : null;
    var matchesRouteBoundary = function (route) {
      return pathname === route || pathname.startsWith(route + '/');
    };
    var isThemeEnabledRoute = Boolean(
      policy &&
        (policy.exact?.includes(pathname) ||
          policy.prefixes?.some(matchesRouteBoundary))
    );

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

      if (root.classList.contains('dark') !== resolvedDark) {
        root.classList.toggle('dark', resolvedDark);
      }

      var metaThemeEnabled = document.querySelector('meta[name="theme-color"]');
      if (metaThemeEnabled) {
        metaThemeEnabled.setAttribute(
          'content',
          resolvedDark ? '#0a0a0a' : '#ffffff'
        );
      }
    } else {
      // Routes outside the explicit policy remain dark. A missing or malformed
      // policy therefore fails closed instead of leaking a stored preference
      // into public profile, playlist, or other unrelated surfaces.
      if (!root.classList.contains('dark')) {
        root.classList.add('dark');
      }

      var metaThemeDark = document.querySelector('meta[name="theme-color"]');
      if (metaThemeDark) {
        metaThemeDark.setAttribute('content', '#0a0a0a');
      }
    }

    var initialProfileMode = new URLSearchParams(
      globalThis.location?.search ?? ''
    ).get('mode');
    if (
      initialProfileMode === 'listen' ||
      initialProfileMode === 'pay' ||
      initialProfileMode === 'subscribe' ||
      initialProfileMode === 'about' ||
      initialProfileMode === 'contact' ||
      initialProfileMode === 'tour' ||
      initialProfileMode === 'releases' ||
      initialProfileMode === 'tip'
    ) {
      root.dataset.profileInitialMode =
        initialProfileMode === 'tip' ? 'pay' : initialProfileMode;
    } else {
      delete root.dataset.profileInitialMode;
    }

    // High contrast mode (independent of light/dark)
    if (typeof localStorage !== 'undefined' && localStorage) {
      var hc = localStorage.getItem('jovie-high-contrast');
      if (hc === 'true' && !root.classList.contains('high-contrast')) {
        root.classList.add('high-contrast');
      } else if (hc !== 'true' && root.classList.contains('high-contrast')) {
        root.classList.remove('high-contrast');
      }
    }
  } catch {
    // Theme detection failed - defaults will apply
  }
})();
