{
    show: false,
    backgroundColor: APP_BACKGROUND_COLOR,
    paintWhenInitiallyHidden: true,
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    icon: getAppIconPath(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Use Electron's native window-controls bounds in the hosted titlebar.
    titleBarOverlay: process.platform === 'darwin' ? { height: 44 } : false,
    trafficLightPosition:
      process.platform === 'darwin' ? MACOS_TRAFFIC_LIGHT_POSITION : undefined,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      devTools: ENABLE_DEVTOOLS,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  }