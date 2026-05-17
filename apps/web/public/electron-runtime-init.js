(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const isElectronRuntime =
      params.get('runtime') === 'electron' ||
      /\bJovieDesktop\//.test(window.navigator.userAgent);

    if (!isElectronRuntime) return;

    const root = document.documentElement;
    root.dataset.desktopRuntime = 'electron';
    root.dataset.devChromeDisabled = '1';
    root.style.setProperty('--dev-toolbar-height', '0px');
  } catch {
    // Non-fatal. The Electron preload also marks the runtime once available.
  }
})();
