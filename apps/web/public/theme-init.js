(function () {
  try {
    if (typeof globalThis.matchMedia !== 'function') return;
    var ls = localStorage.getItem('jovie-theme');
    var mql = globalThis.matchMedia('(prefers-color-scheme: dark)');
    var systemPref = mql.matches ? 'dark' : 'light';
    var pref = ls && ls !== 'system' ? ls : systemPref;
    var root = document.documentElement;
    if (pref === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');

    // High contrast mode (independent of light/dark)
    var hc = localStorage.getItem('jovie-high-contrast');
    if (hc === 'true') root.classList.add('high-contrast');
    else root.classList.remove('high-contrast');
  } catch {
    // Theme detection failed - defaults will apply
  }
})();
