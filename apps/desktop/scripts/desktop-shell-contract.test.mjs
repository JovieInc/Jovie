import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

test('desktop window enters the authenticated chat shell instead of the web root', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');

  assert.match(
    mainSource,
    /const APP_ENTRY_URL = buildAppUrl\('\/app\/chat'\);/
  );
  assert.match(mainSource, /url\.searchParams\.set\('runtime', 'electron'\);/);
  assert.match(
    mainSource,
    /const DESKTOP_USER_AGENT_PRODUCT = `JovieDesktop\/\$\{app\.getVersion\(\)\}`;/
  );
  assert.match(
    mainSource,
    /await shell\.openExternal\(parsed\.toString\(\)\);/
  );
  assert.match(mainSource, /const MACOS_TRAFFIC_LIGHT_X = 20;/);
  assert.match(mainSource, /const MACOS_TRAFFIC_LIGHT_Y = 17;/);
  assert.match(
    mainSource,
    /const MACOS_TRAFFIC_LIGHT_POSITION = \{\s*x: MACOS_TRAFFIC_LIGHT_X,\s*y: MACOS_TRAFFIC_LIGHT_Y,\s*\} as const;/
  );
  assert.match(mainSource, /function getDesktopAppDisplayName\(\): string/);
  assert.match(mainSource, /if \(APP_ENV === 'local'\) return 'Jovie Local';/);
  assert.match(mainSource, /app\.setName\(getDesktopAppDisplayName\(\)\);/);
  assert.match(mainSource, /APP_ENV === 'local'/);
  assert.match(mainSource, /Jovie-Local/);
  assert.match(mainSource, /win\.webContents\.setUserAgent\(/);
  assert.match(
    mainSource,
    /function createWindow\(initialUrl = APP_ENTRY_URL\): BrowserWindow/
  );
  assert.match(
    mainSource,
    /process\.platform === 'darwin' \? MACOS_TRAFFIC_LIGHT_POSITION : undefined/
  );
  assert.doesNotMatch(
    mainSource,
    /function createWindow\(initialUrl = APP_URL\): BrowserWindow/
  );
});

test('desktop polls build-info and reloads only hud windows on deploy drift', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');

  for (const symbol of [
    'HUD_BUILD_INFO_POLL_INTERVAL_MS',
    'fetchHudBuildFingerprint',
    'getHudBuildFingerprint',
    'decideHudBuildReload',
    'isHudRoutePath',
    'isHudWindow',
    'scheduleHudBuildAutoReload',
  ]) {
    assert.match(mainSource, new RegExp(`\\b${symbol}\\b`));
  }

  assert.match(mainSource, /\/api\/health\/build-info/);
  assert.match(mainSource, /60 \* 1000/);
  assert.match(
    mainSource,
    /BrowserWindow\.getAllWindows\(\)\.some\(isHudWindow\)/
  );
  assert.match(mainSource, /win\.webContents\.reload\(\)/);
  assert.doesNotMatch(mainSource, /commitSha.*deployedAt/);
});

test('desktop window fails into a branded Jovie recovery surface', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');
  const tokenSource = await readFile(
    join(desktopRoot, 'src/system-b-tokens.ts'),
    'utf8'
  );

  assert.match(
    mainSource,
    /import \{ SYSTEM_B_DESKTOP_TOKENS \} from '\.\/system-b-tokens';/
  );
  assert.match(
    mainSource,
    /const APP_BACKGROUND_COLOR = SYSTEM_B_DESKTOP_TOKENS\.backgroundColor;/
  );
  assert.match(mainSource, /function buildDesktopLoadFailureUrl\(\): string/);
  assert.match(mainSource, /Jovie Desktop/);
  assert.match(mainSource, /Built for artists/);
  assert.match(mainSource, /const DESKTOP_RUNTIME_LABEL_BY_PLATFORM/);
  assert.match(mainSource, /darwin: 'Mac OS'/);
  assert.match(mainSource, /linux: 'Linux'/);
  assert.match(mainSource, /win32: 'Windows'/);
  assert.match(
    mainSource,
    /function getDesktopRuntimeLabel\(\s*platform: NodeJS\.Platform = process\.platform\s*\): string/
  );
  assert.match(
    mainSource,
    /const runtimeLabel = escapeHtmlAttribute\(getDesktopRuntimeLabel\(\)\);/
  );
  assert.match(mainSource, /Desktop shell runtime: \$\{runtimeLabel\}/);
  assert.doesNotMatch(mainSource, /Desktop shell runtime: Mac OS/);
  assert.match(mainSource, /data:text\/html;charset=utf-8/);
  assert.match(
    mainSource,
    /function escapeHtmlAttribute\(value: string\): string/
  );
  assert.match(
    mainSource,
    /<a class="primary" href="\$\{retryUrl\}">Retry<\/a>/
  );
  assert.doesNotMatch(mainSource, /onclick="window\.location\.href/);
  assert.match(mainSource, /did-fail-load/);
  assert.match(mainSource, /NAVIGATION_ABORTED_ERROR_CODE/);
  assert.match(
    mainSource,
    /maybeShowDesktopAuthHandoff\(resolveNavigationUrl\(validatedURL\)\)/
  );
  assert.match(mainSource, /showDesktopLoadFailure\(win\)/);
  assert.match(mainSource, /viewBox="0 0 353\.68 347\.97"/);
  assert.match(mainSource, /START_DESKTOP_AUTH_HANDOFF_CHANNEL/);
  assert.match(mainSource, /OPEN_DESKTOP_AUTH_URL_CHANNEL/);
  assert.match(mainSource, /CLOSE_DESKTOP_AUTH_WINDOW_CHANNEL/);
  assert.match(mainSource, /function hideMainWindowForAuthHandoff\(\): void/);
  assert.match(
    mainSource,
    /function restoreMainWindowAfterAuthHandoff\(\): void/
  );
  assert.match(mainSource, /mainWindowHiddenForAuthHandoff/);
  assert.match(mainSource, /win === mainWindow && isAuthHandoffOpen\(\)/);
  assert.match(
    mainSource,
    /hideMainWindowForAuthHandoff\(\);\s*if \(authHandoffWindow\) showWindow\(authHandoffWindow\);/
  );
  assert.match(mainSource, /const initialVisibilityFallback = setTimeout/);
  assert.match(mainSource, /current === 'about:blank'/);
  assert.match(
    mainSource,
    /const authUrl = buildCentralDesktopAuthUrl\('sign_in', '\/app'\);/
  );
  assert.match(
    mainSource,
    /void win\.loadURL\(buildDesktopAuthHandoffUrl\(authUrl\)\);/
  );
  assert.match(
    mainSource,
    /void win\.loadURL\(buildDesktopAuthHandoffUrl\(initialAuthUrl\)\);/
  );
  assert.doesNotMatch(mainSource, /win\.loadURL\('about:blank'\)/);
  assert.doesNotMatch(mainSource, /parent: mainWindow/);
  assert.doesNotMatch(mainSource, /M31 10A20 20 0 0 0 11 30H31V10Z/);
  assert.doesNotMatch(mainSource, /M11 31L30 31M14 36L31 36M18 41L32 41/);
  assert.match(mainSource, /--system-b-bg-base:/);
  assert.match(mainSource, /--system-b-shadow-popover:/);
  assert.match(mainSource, /min-height: 100vh/);
  assert.match(mainSource, /background: var\(--system-b-bg-base\)/);
  assert.match(mainSource, /background: var\(--system-b-surface-1\)/);
  assert.match(mainSource, /border-radius: var\(--system-b-radius-pill\)/);
  assert.doesNotMatch(
    mainSource,
    /background: linear-gradient\(145deg, rgba\(15,16,17,0\.94\), rgba\(8,9,10,0\.98\)\)/
  );
  assert.doesNotMatch(mainSource, /const APP_BACKGROUND_COLOR = '#08090a';/);
  assert.doesNotMatch(mainSource, /background: #08090a/);
  assert.match(tokenSource, /SYSTEM_B_DESKTOP_TOKENS/);
  assert.match(tokenSource, /backgroundColor: '#06070a'/);
  assert.match(tokenSource, /radiusPill: '999px'/);
});

const FORBIDDEN_MAC_ENTITLEMENTS = [
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.disable-library-validation',
];

test('desktop macOS entitlements keep only allow-jit (no sandbox-weakening flags)', async () => {
  for (const fileName of [
    'entitlements.mac.plist',
    'entitlements.mac.inherit.plist',
  ]) {
    const entitlements = await readFile(
      join(desktopRoot, 'build', fileName),
      'utf8'
    );

    assert.match(
      entitlements,
      /<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*\n\s*<true\/>/
    );

    for (const forbidden of FORBIDDEN_MAC_ENTITLEMENTS) {
      assert.doesNotMatch(entitlements, new RegExp(`<key>${forbidden}</key>`));
    }
  }
});

test('desktop production bundle declares the jovie auth protocol', async () => {
  const [builderConfig, mainSource, stagingConfig, localConfig] =
    await Promise.all([
      readFile(join(desktopRoot, 'electron-builder.yml'), 'utf8'),
      readFile(join(desktopRoot, 'src/main.ts'), 'utf8'),
      readFile(join(desktopRoot, 'electron-builder.staging.yml'), 'utf8'),
      readFile(join(desktopRoot, 'electron-builder.local.yml'), 'utf8'),
    ]);

  assert.match(builderConfig, /CFBundleURLTypes:/);
  assert.match(builderConfig, /CFBundleURLName: Jovie Auth/);
  assert.match(builderConfig, /CFBundleURLSchemes:\s*\n\s*- jovie/);
  assert.match(mainSource, /APP_ENV === 'staging'\s*\?\s*'jovie-staging'/);
  assert.match(mainSource, /APP_ENV === 'local'\s*\?\s*'jovie-local'/);
  assert.match(mainSource, /:\s*'jovie';/);
  assert.match(
    mainSource,
    /function isAuthReturnDeepLinkCandidate\(urlString: string\): boolean/
  );
  assert.match(
    mainSource,
    /isAuthReturnDeepLinkCandidate\(arg\) && !parseDesktopAuthReturnDeepLink\(arg\)/
  );
  assert.doesNotMatch(
    mainSource,
    /startsWith\(`\$\{AUTH_RETURN_PROTOCOL\}\/\/\$\{AUTH_RETURN_HOST\}`\)/
  );
  assert.match(
    mainSource,
    /app\.setAsDefaultProtocolClient\(AUTH_RETURN_SCHEME/
  );
  assert.match(stagingConfig, /CFBundleURLTypes:/);
  assert.match(stagingConfig, /CFBundleURLName: Jovie Staging Auth/);
  assert.match(stagingConfig, /CFBundleURLSchemes:\s*\n\s*- jovie-staging/);
  assert.match(localConfig, /CFBundleURLTypes:/);
  assert.match(localConfig, /CFBundleURLName: Jovie Local Auth/);
  assert.match(localConfig, /CFBundleURLSchemes:\s*\n\s*- jovie-local/);
});

test('desktop navigation uses explicit URL disposition allowlists', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');
  const navigationSource = await readFile(
    join(desktopRoot, 'src/navigation.ts'),
    'utf8'
  );

  assert.match(mainSource, /getUrlDisposition as getDesktopUrlDisposition/);
  assert.match(
    mainSource,
    /isAllowedExternalUrl as isAllowedDesktopExternalUrl/
  );
  assert.match(
    mainSource,
    /const URL_DISPOSITION_OPTIONS = \{ appUrl: APP_URL, appEnv: APP_ENV \} as const;/
  );
  assert.match(
    mainSource,
    /function resolveNavigationUrl\(urlString: string\): string/
  );
  assert.match(
    mainSource,
    /return new URL\(urlString, APP_URL\)\.toString\(\);/
  );
  assert.match(
    mainSource,
    /authHandoffWindow\.webContents\.on\('will-navigate', \(event, url\) =>/
  );
  assert.match(
    mainSource,
    /win\.webContents\.on\('will-navigate', \(event, url\) =>/
  );
  assert.match(
    mainSource,
    /win\.webContents\.on\('will-frame-navigate', event =>/
  );
  assert.match(
    mainSource,
    /win\.webContents\.on\('will-redirect', \(event, url, _isInPlace, isMainFrame\) =>/
  );
  assert.doesNotMatch(mainSource, /resolveNavigationUrl\(event\.url\)/);
  assert.match(mainSource, /getUrlDisposition\(event\.url\) === 'in-app'/);
  assert.match(
    mainSource,
    /const DESKTOP_BROWSER_AUTH_PATHS = \[\s*'\/signin',\s*'\/signup',\s*'\/sign-in',\s*'\/sign-up',\s*\] as const;/
  );
  assert.match(mainSource, /'\/app\/auth\/callback'/);
  assert.match(
    mainSource,
    /return DESKTOP_BROWSER_AUTH_PATHS\.some\(prefix => pathname === prefix\);/
  );
  assert.doesNotMatch(
    mainSource,
    /return parsed\.protocol === 'https:' \|\| parsed\.protocol === 'mailto:';/
  );

  assert.match(navigationSource, /const IN_APP_ROUTE_PREFIXES = \[/);
  assert.match(navigationSource, /'\/app'/);
  assert.match(navigationSource, /const AUTH_CALLBACK_ROUTE_PREFIXES = \[/);
  assert.match(navigationSource, /'\/signin\/sso-callback'/);
  assert.match(navigationSource, /'\/app\/auth\/callback'/);
  assert.match(
    navigationSource,
    /const SAME_ORIGIN_EXTERNAL_ROUTE_PREFIXES = \[/
  );
  assert.match(navigationSource, /'\/legal'/);
  assert.match(navigationSource, /'\/pricing'/);
  assert.match(navigationSource, /'\/blog'/);
  assert.match(
    navigationSource,
    /const DEFAULT_DOCS_URL = 'https:\/\/docs\.jov\.ie';/
  );
  assert.match(navigationSource, /PUBLIC_PROFILE_RESERVED_ROOT_SEGMENTS/);
  assert.match(navigationSource, /parsed\.protocol === 'mailto:'/);
  assert.match(navigationSource, /urlString\.startsWith\('\/\/'\)/);
  assert.match(navigationSource, /decoded\.includes\('\\\\'\)/);
});

test('preload marks the hosted app as Electron after the document root is ready', async () => {
  const preloadSource = await readFile(
    join(desktopRoot, 'src/preload.ts'),
    'utf8'
  );

  assert.match(preloadSource, /function installElectronRuntimeMarker\(\)/);
  assert.match(preloadSource, /installElectronRuntimeMarker\(\);/);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld/);
  assert.match(preloadSource, /markElectronRuntime\(\)/);
  assert.match(preloadSource, /DOMContentLoaded/);
  assert.match(preloadSource, /dataset\.desktopRuntime = 'electron'/);
  assert.match(preloadSource, /startDesktopAuthHandoff/);
  assert.match(preloadSource, /openDesktopAuthUrl/);
  assert.match(preloadSource, /closeDesktopAuthWindow/);
  assert.match(preloadSource, /sendAppBooted/);
  assert.match(preloadSource, /ipcRenderer\.send\(APP_BOOTED_CHANNEL\)/);
});

test('desktop bridge exposes bounded dictation support', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');
  const preloadSource = await readFile(
    join(desktopRoot, 'src/preload.ts'),
    'utf8'
  );

  assert.match(
    mainSource,
    /const DICTATION_STATUS_CHANNEL = 'dictation-status'/
  );
  assert.match(mainSource, /ipcMain\.handle\(\s*DICTATION_STATUS_CHANNEL,/);
  assert.match(mainSource, /function getDesktopDictationStatus\(\)/);
  assert.match(mainSource, /nativeAvailable: false/);
  assert.match(mainSource, /webSpeechFallbackAllowed: true/);
  assert.match(mainSource, /shouldGrantTrustedAudioPermission/);
  assert.match(mainSource, /shouldGrantTrustedAudioPermissionCheck/);
  assert.match(mainSource, /backgroundThrottling: false/);
  assert.match(mainSource, /installDesktopCspWatchdog/);
  assert.match(
    mainSource,
    /function shouldScheduleDesktopAutoUpdate\(\): boolean/
  );
  assert.match(mainSource, /if \(APP_ENV === 'local'/);
  assert.match(mainSource, /autoUpdater\.allowDowngrade = false/);
  assert.match(mainSource, /if \(!shouldScheduleDesktopAutoUpdate\(\)\)/);
  assert.match(mainSource, /sanitizeWindowState/);
  assert.match(mainSource, /bindPendingDesktopAuthCompletion/);
  assert.match(mainSource, /DESKTOP_AUTH_FLOW_PARAM/);
  assert.match(mainSource, /!app\.isPackaged/);
  assert.match(mainSource, /reportDesktopSecurityEvent/);
  assert.match(preloadSource, /getDictationStatus/);
  assert.match(
    preloadSource,
    /ipcRenderer\.invoke\(DICTATION_STATUS_CHANNEL\)/
  );
});

test('desktop dev defaults to the local app shell and packaged builds keep production', async () => {
  const packageJson = await readFile(join(desktopRoot, 'package.json'), 'utf8');
  assert.match(
    packageJson,
    /"predev": "cross-env ELECTRON_ENV=local node scripts\/write-env\.mjs"/
  );
  const envGeneratedPath = join(desktopRoot, 'src/env.generated.ts');
  const originalEnvGenerated = await readFile(envGeneratedPath, 'utf8');

  try {
    const { stdout: localStdout } = await execFileAsync(
      process.execPath,
      [join(desktopRoot, 'scripts/write-env.mjs')],
      {
        cwd: desktopRoot,
        env: {
          ...process.env,
          ELECTRON_ENV: 'local',
        },
      }
    );
    const localEnv = await readFile(envGeneratedPath, {
      encoding: 'utf8',
    });
    assert.match(localStdout, /APP_ENV='local'/);
    assert.match(localEnv, /APP_ENV: 'production' \| 'staging' \| 'local'/);
    assert.match(localEnv, /APP_URL = 'http:\/\/localhost:3112'/);

    const { stdout: localOverrideStdout } = await execFileAsync(
      process.execPath,
      [join(desktopRoot, 'scripts/write-env.mjs')],
      {
        cwd: desktopRoot,
        env: {
          ...process.env,
          ELECTRON_ENV: 'local',
          ELECTRON_APP_URL: 'http://127.0.0.1:3112/app/ignored',
        },
      }
    );
    const localOverrideEnv = await readFile(envGeneratedPath, {
      encoding: 'utf8',
    });
    assert.match(localOverrideStdout, /APP_ENV='local'/);
    assert.match(localOverrideEnv, /APP_URL = 'http:\/\/127\.0\.0\.1:3112'/);

    const { stdout: productionStdout } = await execFileAsync(
      process.execPath,
      [join(desktopRoot, 'scripts/write-env.mjs')],
      {
        cwd: desktopRoot,
        env: {
          ...process.env,
          ELECTRON_ENV: 'production',
        },
      }
    );
    const productionEnv = await readFile(envGeneratedPath, 'utf8');
    assert.match(productionStdout, /APP_ENV='production'/);
    assert.match(productionEnv, /APP_URL = 'https:\/\/jov\.ie'/);

    const { stdout: stagingStdout } = await execFileAsync(
      process.execPath,
      [join(desktopRoot, 'scripts/write-env.mjs')],
      {
        cwd: desktopRoot,
        env: {
          ...process.env,
          ELECTRON_ENV: 'staging',
        },
      }
    );
    const stagingEnv = await readFile(envGeneratedPath, 'utf8');
    assert.match(stagingStdout, /APP_ENV='staging'/);
    assert.match(stagingEnv, /APP_URL = 'https:\/\/staging\.jov\.ie'/);
  } finally {
    await writeFile(envGeneratedPath, originalEnvGenerated);
  }
});

test('native auth smoke keeps browser callbacks on the browser auth origin', async () => {
  const smokeSource = await readFile(
    join(desktopRoot, 'scripts/smoke-native-auth.mjs'),
    'utf8'
  );

  assert.match(smokeSource, /const callbackOrigin = parsed\.origin;/);
  assert.match(
    smokeSource,
    /const BASE_URL = process\.env\.BASE_URL \?\? 'http:\/\/localhost:3112';/
  );
  assert.match(
    smokeSource,
    /const NATIVE_AUTH_CALLBACK_SCHEME = getNativeAuthSchemeForBaseUrl\(BASE_URL\);/
  );
  assert.match(
    smokeSource,
    /if \(hostname === 'staging\.jov\.ie'\) return 'jovie-staging';/
  );
  assert.match(smokeSource, /if \(hostname === 'jov\.ie'\) return 'jovie';/);
  assert.match(
    smokeSource,
    /hostname === 'localhost'[\s\S]*return 'jovie-local';/
  );
  assert.match(smokeSource, /return 'jovie';\s*\n}/);
  assert.match(smokeSource, /NATIVE_AUTH_CALLBACK_PREFIX/);
  assert.match(smokeSource, /async function waitForDesktopAuthHandoff/);
  assert.match(smokeSource, /state === 'opened'/);
  assert.match(
    smokeSource,
    /candidate\.textContent\?\.includes\('Cancel Sign-In'\)/
  );
  assert.match(smokeSource, /process\.env\.SMOKE_REQUEST_TIMEOUT_MS/);
  assert.match(smokeSource, /180_000/);
  assert.match(
    smokeSource,
    /const SMOKE_AUTH_EVIDENCE_KEY = 'jovie\.desktopAuth\.smokeAuthEvidence';/
  );
  assert.match(smokeSource, /readStoredSmokeAuthEvidence/);
  assert.match(smokeSource, /captureElectronAuthEvidence/);
  assert.match(smokeSource, /async function signOutOrClearElectronAuth/);
  assert.match(smokeSource, /window\.localStorage\.setItem/);
  assert.match(smokeSource, /evidenceSource: 'clerk-token'/);
  assert.match(smokeSource, /function getElectronStorageOrigins\(\)/);
  assert.match(smokeSource, /Network\.clearBrowserCookies/);
  assert.match(smokeSource, /Storage\.clearDataForOrigin/);
  assert.match(
    smokeSource,
    /new URL\(\s*`\/auth\/callback\?state=\$\{encodeURIComponent\(authState\)\}`,\s*callbackOrigin\s*\)/
  );
  assert.doesNotMatch(
    smokeSource,
    /new URL\(\s*`\/auth\/callback\?state=\$\{encodeURIComponent\(authState\)\}`,\s*BASE_URL\s*\)/
  );
  assert.match(smokeSource, /async function completeNativeReturnBounce/);
  assert.match(
    smokeSource,
    /parsedRedirect\.pathname !== '\/auth\/native-return'/
  );
  assert.match(
    smokeSource,
    /redirectUrl\.startsWith\(NATIVE_AUTH_CALLBACK_PREFIX\)/
  );
});

test('hosted web app has an early Electron runtime marker before first paint', async () => {
  const webRoot = join(desktopRoot, '..', 'web');
  const rootLayout = await readFile(join(webRoot, 'app/layout.tsx'), 'utf8');
  const globalsCss = await readFile(join(webRoot, 'app/globals.css'), 'utf8');
  const titlebarSource = await readFile(
    join(webRoot, 'components/atoms/DesktopTitlebar.tsx'),
    'utf8'
  );
  const runtimeInit = await readFile(
    join(webRoot, 'public/electron-runtime-init.js'),
    'utf8'
  );

  // Loaded as a plain synchronous <script> in <head> (not next/script) so it
  // runs before React hydration. next/script + nonce drift caused local E2E
  // console errors, so the runtime marker is injected this way intentionally.
  assert.match(rootLayout, /<script src='\/electron-runtime-init\.js' \/>/);
  assert.match(rootLayout, /ElectronBootHeartbeat/);
  const heartbeatSource = await readFile(
    join(webRoot, 'components/desktop/ElectronBootHeartbeat.tsx'),
    'utf8'
  );
  assert.match(heartbeatSource, /sendAppBooted/);
  assert.match(runtimeInit, /params\.get\('runtime'\) === 'electron'/);
  assert.match(runtimeInit, /JovieDesktop\\\//);
  assert.match(runtimeInit, /root\.dataset\.desktopRuntime = 'electron'/);
  assert.match(runtimeInit, /root\.dataset\.devChromeDisabled = '1'/);
  assert.match(globalsCss, /--electron-titlebar-height: 40px;/);
  assert.match(globalsCss, /--electron-traffic-light-safe-width: 72px;/);
  assert.match(globalsCss, /--electron-traffic-light-x: 20px;/);
  assert.match(globalsCss, /--electron-traffic-light-y: 17px;/);
  assert.match(
    globalsCss,
    /--electron-sidebar-width: var\(--linear-app-sidebar-width\);/
  );
  assert.match(globalsCss, /--electron-sidebar-collapsed-width: 52px;/);
  assert.match(
    globalsCss,
    /grid-template-columns: var\(--electron-sidebar-width\) minmax\(0, 1fr\);/
  );
  assert.doesNotMatch(
    globalsCss,
    /grid-template-columns: var\(--linear-app-sidebar-width\)/
  );
  assert.match(
    titlebarSource,
    /data-testid='electron-traffic-light-safe-area'/
  );
  assert.match(
    titlebarSource,
    /w-\(--electron-traffic-light-safe-width\)/
  );
  assert.doesNotMatch(titlebarSource, /w-\[72px\]/);
});

test('desktop shell has a renderer heartbeat watchdog for 200-but-crashed pages', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');
  const preloadSource = await readFile(
    join(desktopRoot, 'src/preload.ts'),
    'utf8'
  );

  // Heartbeat channel constant
  assert.match(
    mainSource,
    /const APP_BOOTED_CHANNEL = 'app-booted'/
  );
  assert.match(
    preloadSource,
    /const APP_BOOTED_CHANNEL = 'app-booted'/
  );

  // Watchdog timer map (per-window)
  assert.match(
    mainSource,
    /const appBootedWatchdogTimers = new Map/
  );

  // did-finish-load starts the 14s watchdog and clears any existing one
  assert.match(
    mainSource,
    /appBootedWatchdogTimers.get\(win\.id\)/
  );
  assert.match(
    mainSource,
    /clearTimeout\(existingTimer\)/
  );
  assert.match(
    mainSource,
    /14_000/
  );

  // Watchdog expiry shows the recovery shell
  assert.match(
    mainSource,
    /showing recovery shell/
  );
  assert.match(
    mainSource,
    /showDesktopLoadFailure\(win\)/
  );

  // IPC handler cancels the watchdog when renderer sends app-booted
  assert.match(
    mainSource,
    /ipcMain\.on\(APP_BOOTED_CHANNEL/
  );
  assert.match(
    mainSource,
    /clearTimeout\(timer\);\s*appBootedWatchdogTimers\.delete\(win\.id\)/
  );

  // Window close cleans up the watchdog
  assert.match(
    mainSource,
    /appBootedWatchdogTimers\.get\(win\.id\)/
  );
  assert.match(
    mainSource,
    /appBootedWatchdogTimers\.delete\(win\.id\)/
  );

  // unresponsive handler now shows recovery shell after a grace period
  assert.match(
    mainSource,
    /Renderer unresponsive for 10s/
  );
  assert.match(
    mainSource,
    /win\.webContents\.once\('responsive'/
  );

  // Preload exposes sendAppBooted
  assert.match(
    preloadSource,
    /sendAppBooted:/
  );
  assert.match(
    preloadSource,
    /\) => \{/  
  );
  assert.match(
    preloadSource,
    /ipcRenderer\.send\(APP_BOOTED_CHANNEL\)/
  );
});
