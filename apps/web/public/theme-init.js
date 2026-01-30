(function () {
  try {
    var ls = localStorage.getItem('jovie-theme');
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var systemPref = mql.matches ? 'dark' : 'light';
    var pref = ls && ls !== 'system' ? ls : systemPref;
    var root = document.documentElement;
    if (pref === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  } catch {
    // Theme detection failed - defaults will apply
  }
})();
