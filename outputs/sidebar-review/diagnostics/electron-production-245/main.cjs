const {app,BrowserWindow,ipcMain}=require('electron');const fs=require('node:fs');const path=require('node:path');
const {evaluateRemoteDebuggingGuard}=require('./remote-debugging-guard.cjs');
const guard=evaluateRemoteDebuggingGuard({isPackaged:app.isPackaged,hasRemoteDebuggingPort:app.commandLine.hasSwitch('remote-debugging-port'),hasRemoteDebuggingPipe:app.commandLine.hasSwitch('remote-debugging-pipe'),jovieDev:process.env.JOVIE_DEV});if(guard.blocked)app.exit(1);
app.setName('Sidebar qualification 245');app.setPath('userData',path.join(__dirname,'isolated-user-data'));app.setPath('sessionData',path.join(__dirname,'isolated-session-data'));app.setActivationPolicy('accessory');
const APP_BACKGROUND_COLOR=require('./system-b-tokens.cjs').SYSTEM_B_DESKTOP_TOKENS.backgroundColor;const MACOS_TRAFFIC_LIGHT_POSITION={x:20,y:17};const windowState={width:1440,height:900,x:40,y:80};const ENABLE_DEVTOOLS=true;const getAppIconPath=()=>undefined;
const options = {
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
    trafficLightPosition: process.platform === 'darwin' ? MACOS_TRAFFIC_LIGHT_POSITION : undefined,
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
};

app.whenReady().then(async()=>{if(app.dock)app.dock.hide();const win=new BrowserWindow(options);globalThis.sidebarWindow=win;
win.webContents.session.webRequest.onBeforeRequest((details,callback)=>{const url=new URL(details.url);callback({cancel:!(['http:'].includes(url.protocol)&&url.origin==='http://127.0.0.1:6027')&&!['data:','blob:'].includes(url.protocol)});});
win.webContents.setWindowOpenHandler(()=>({action:'deny'}));ipcMain.handle('get-build-identity',()=>({provenance:'unavailable',channel:null,version:null,sourceRevision:null,builtAt:null}));ipcMain.handle('desktop-get-visual-activity',()=>win.isVisible()&&!win.isMinimized());
await win.loadURL('http://127.0.0.1:6027/iframe.html?id=organisms-unifiedsidebar--shared-shell&viewMode=story');});app.on('window-all-closed',()=>app.quit());
