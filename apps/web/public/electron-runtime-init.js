(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const isElectronRuntime =
      params.get('runtime') === 'electron' ||
      /\bJovieDesktop\//.test(window.navigator.userAgent);

    if (!isElectronRuntime) return;

    const root = document.documentElement;
    root.dataset.desktopRuntime = 'electron';
    // The preload also sets this; mark it before paint so the traffic-light
    // inset (hiddenInset title bar, macOS only) never flashes off.
    if (!root.dataset.electronPlatform) {
      const ua = window.navigator.userAgent;
      root.dataset.electronPlatform = /\bMac OS X\b|\bMacintosh\b/.test(ua)
        ? 'darwin'
        : /\bWindows\b/.test(ua)
          ? 'win32'
          : 'linux';
    }
    root.dataset.devChromeDisabled = '1';
    root.style.setProperty('--dev-toolbar-height', '0px');

    // Stale PWA service workers from prior web sessions can intercept auth
    // callbacks inside Electron and serve offline.html. Clear them early.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then(registrations => {
          for (const registration of registrations) {
            void registration.unregister();
          }
        })
        .catch(() => {});
    }
  } catch {
    // Non-fatal. The Electron preload also marks the runtime once available.
  }
})();
