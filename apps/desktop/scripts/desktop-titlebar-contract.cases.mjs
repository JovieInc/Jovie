import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('hosted web app has an early Electron runtime marker before first paint', async () => {
  const webRoot = join(desktopRoot, '..', 'web');
  const rootLayout = await readFile(join(webRoot, 'app/layout.tsx'), 'utf8');
  const globalsCss = await readElectronChromeCss(webRoot);
  const titlebarSource = await readFile(
    join(webRoot, 'components/organisms/DesktopTitlebar.tsx'),
    'utf8'
  );
  const runtimeInit = await readFile(
    join(webRoot, 'public/electron-runtime-init.js'),
    'utf8'
  );

  // Plain <script> in <head> (not next/script); async still runs before
  // React hydration and keeps it off the FCP chain (JOV-12023).
  assert.match(rootLayout, /async src='\/electron-runtime-init\.js'/);
  assert.match(runtimeInit, /params\.get\('runtime'\) === 'electron'/);
  assert.match(runtimeInit, /JovieDesktop\\\//);
  assert.match(runtimeInit, /root\.dataset\.desktopRuntime = 'electron'/);
  assert.match(runtimeInit, /root\.dataset\.devChromeDisabled = '1'/);
  assert.match(
    globalsCss,
    /--electron-titlebar-height: var\(--chrome-title-row-height\);/
  );
  assert.match(globalsCss, /--chrome-title-row-height: 44px;/);
  assert.match(globalsCss, /--chrome-traffic-lights-leading: 12px;/);
  assert.match(globalsCss, /--chrome-traffic-lights-reserve: 76px;/);
  assert.match(globalsCss, /--electron-traffic-light-control-size: 14px;/);
  assert.match(globalsCss, /--electron-traffic-light-clearance: 6px;/);
  assert.match(globalsCss, /--electron-traffic-light-toggle-gap: 12px;/);
  assert.match(globalsCss, /--electron-traffic-light-safe-width:\s*calc\(/);
  assert.doesNotMatch(
    globalsCss,
    /--electron-traffic-light-safe-width:\s*\d+px;/
  );
  assert.match(
    globalsCss,
    /--electron-traffic-light-x: var\(--chrome-traffic-lights-leading\);/
  );
  assert.match(globalsCss, /--electron-traffic-light-y: 23px;/);
  // JOV-8940: full screen hides the native lights — the reserve collapses
  // to zero while the 44pt title row keeps its height above sidebar content.
  assert.match(
    globalsCss,
    /html\[data-desktop-runtime="electron"\]\[data-electron-fullscreen="true"\] \{[\s\S]*?--electron-traffic-light-safe-width: calc\(\s*var\(--chrome-traffic-lights-reserve\)\s\*\s*0\s*\);/
  );
  // JOV-8974: the shell keeps one gutter on every edge. The body's top
  // padding and the titlebar band's top offset both use the shell gap.
  assert.match(
    globalsCss,
    /\[data-app-shell-body="true"\]\[data-electron-top-gap-owner="titlebar"\] \{[^}]*padding-top:\s*var\(--app-shell-gap\);/s
  );
  assert.match(
    globalsCss,
    /\[data-electron-titlebar="true"\] \{[^}]*top:\s*var\(--app-shell-gap\);/s
  );
  assert.match(
    globalsCss,
    /--electron-sidebar-width: var\(--app-shell-sidebar-width\);/
  );
  assert.match(globalsCss, /--electron-sidebar-collapsed-width: 52px;/);
  // The electron titlebar is an absolute flex overlay sharing one top row
  // with the page header; the retired two-column grid must stay gone.
  assert.doesNotMatch(
    globalsCss,
    /grid-template-columns: var\(--electron-sidebar-width\)/
  );
  // The overlay reserves a fixed control-row width for native window controls.
  assert.match(globalsCss, /--electron-controls-width: 200px;/);
  assert.doesNotMatch(
    globalsCss,
    /grid-template-columns: var\(--linear-app-sidebar-width\)/
  );
  // JOV-7740: the titlebar stays a flex row. A grid track must not return.
  assert.match(
    globalsCss,
    /\[data-electron-titlebar="true"\] \{[^}]*display:\s*flex;/s
  );
  assert.match(
    globalsCss,
    /width:\s*calc\(var\(--app-shell-gap\)\s*\+\s*var\(--electron-sidebar-width\)\);/
  );
  assert.match(
    titlebarSource,
    /data-testid='electron-traffic-light-safe-area'/
  );
  // Tailwind v4 CSS-var utility form (not arbitrary w-[var(...)]).
  assert.match(titlebarSource, /w-\(--electron-traffic-light-safe-width\)/);
  assert.doesNotMatch(titlebarSource, /w-\[72px\]/);
});

test('macOS titlebar reserve safely contains traffic lights at every supported window size', async () => {
  const mainSource = await readWindowChromeSource();
  const webRoot = join(desktopRoot, '..', 'web');
  const globalsCss = await readElectronChromeCss(webRoot);
  const designSystem = await readFile(
    join(webRoot, 'styles/design-system.css'),
    'utf8'
  );

  // These values deliberately cross the native-window and hosted-renderer
  // boundary. The renderer must reserve enough room for the native controls;
  // a route cannot paper over a collision at compact width or after resize.
  const x = Number(
    mainSource.match(/const MACOS_TRAFFIC_LIGHT_X = (\d+);/)?.[1]
  );
  const y = Number(
    mainSource.match(/const MACOS_TRAFFIC_LIGHT_Y = (\d+);/)?.[1]
  );
  const titlebarHeight = Number(
    globalsCss.match(/--chrome-title-row-height: (\d+)px;/)?.[1]
  );
  const controlDiameter = Number(
    globalsCss.match(/--electron-traffic-light-control-size: (\d+)px;/)?.[1]
  );
  const trailingClearance = Number(
    globalsCss.match(/--electron-traffic-light-clearance: (\d+)px;/)?.[1]
  );
  const shellGap = Number(
    designSystem.match(/--app-shell-gap:\s*(\d+)px;/)?.[1]
  );
  const toggleGap = Number(
    globalsCss.match(/--electron-traffic-light-toggle-gap:\s*(\d+)px;/)?.[1]
  );
  // Safe width is a calc of those tokens. The titlebar's padding-left is the
  // shell gap, so the reserve is measured from the content origin: the
  // spacer reaches from there to the native lights' trailing edge
  // (leading + 3 controls + 2 inter-light clearances - gap).
  const safeWidth = x + 3 * controlDiameter + 2 * trailingClearance - shellGap;

  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  assert.ok(Number.isFinite(titlebarHeight) && Number.isFinite(safeWidth));
  assert.equal(safeWidth, 58);
  assert.equal(titlebarHeight, 44);

  // JOV-8940: the light centers must sit on the 44pt row's icon centerline:
  // in-band y (15px) + half the control (7px) == half the row (22px).
  assert.equal(
    y - shellGap + controlDiameter / 2,
    titlebarHeight / 2,
    `native light center (${y - shellGap + controlDiameter / 2}px in-band) must match the row center (${titlebarHeight / 2}px)`
  );

  // The first interactive control starts at window x = shell gap + reserve
  // + the locked toggle gap. That must clear the third traffic light plus
  // the locked gap at every supported window size.
  const lightsEnd = x + 3 * controlDiameter + 2 * trailingClearance;
  const toggleStart = shellGap + safeWidth + toggleGap;
  assert.ok(
    toggleStart >= lightsEnd + toggleGap,
    `toggle window x (${toggleStart}px) must clear lights ending at ${lightsEnd}px plus ${toggleGap}px`
  );
  assert.ok(
    titlebarHeight >= y + controlDiameter,
    `titlebar height (${titlebarHeight}px) must contain y=${y}px + traffic-light height`
  );

  // JOV-8974: the CSS mirror of the native light position must track
  // MACOS_TRAFFIC_LIGHT_Y — the band and the lights sit one shell gap down.
  const cssLightY = Number(
    globalsCss.match(/--electron-traffic-light-y:\s*(\d+)px;/)?.[1]
  );
  assert.equal(cssLightY, y);

  // Main-content clearance comes from the header-inset path: the shared top
  // row reserves the fixed control-row width so chrome never overlaps the
  // native control reserve after resize.
  assert.match(globalsCss, /padding-left: var\(--electron-controls-width\);/);
  assert.match(mainSource, /minWidth: 800,/);
});

test('Electron shell learns native full-screen transitions to collapse the traffic-light reserve', async () => {
  const main = await readWindowChromeSource();
  const preload = await readFile(join(desktopRoot, 'src/preload.ts'), 'utf8');
  const css = await readElectronChromeCss(join(desktopRoot, '../web'));
  const titlebarSource = await readFile(
    join(desktopRoot, '../web/components/organisms/DesktopTitlebar.tsx'),
    'utf8'
  );

  // The main process broadcasts every native full-screen transition.
  assert.match(
    main,
    /const FULL_SCREEN_STATE_CHANNEL = 'desktop-full-screen-changed';/
  );
  assert.match(
    main,
    /const GET_FULL_SCREEN_STATE_CHANNEL = 'desktop-get-full-screen-state';/
  );
  assert.match(
    main,
    /win\.webContents\.send\(FULL_SCREEN_STATE_CHANNEL, win\.isFullScreen\(\)\)/
  );
  assert.match(main, /win\.on\('enter-full-screen', sendFullScreenState\)/);
  assert.match(main, /win\.on\('leave-full-screen', sendFullScreenState\)/);
  assert.match(main, /ipcMain\.handle\(GET_FULL_SCREEN_STATE_CHANNEL/);

  // The preload bridge exposes the state and the transition subscription.
  assert.match(
    preload,
    /getFullScreenState: \(\) =>\s*ipcRenderer\.invoke\(GET_FULL_SCREEN_STATE_CHANNEL\) as Promise<boolean>/
  );
  assert.match(
    preload,
    /onFullScreenChanged: \(callback: \(isFullScreen: boolean\) => void\)/
  );

  // The renderer mirrors the native state onto the document root.
  assert.match(titlebarSource, /observeDesktopFullScreen/);
  assert.match(
    titlebarSource,
    /root\.dataset\.electronFullscreen = isFullScreen \? 'true' : 'false';/
  );

  // Full screen collapses the reserve to zero while the 44pt row keeps its
  // height above sidebar content — no top gap appears when the lights hide.
  const fullScreen =
    css.match(
      /html\[data-desktop-runtime="electron"\]\[data-electron-fullscreen="true"\] \{([^}]+)\}/
    )?.[1] ?? '';
  assert.match(
    fullScreen,
    /--electron-traffic-light-safe-width: calc\(\s*var\(--chrome-traffic-lights-reserve\)\s*\*\s*0\s*\)/
  );
  assert.doesNotMatch(fullScreen, /--electron-titlebar-height: 0/);
  assert.doesNotMatch(fullScreen, /--chrome-title-row-height: 0/);
});

test('native full-screen state follows the window and rejects untrusted snapshot senders', async () => {
  const { outputFiles } = await build({
    entryPoints: [join(desktopRoot, 'src/window-chrome.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    write: false,
  });
  let fullScreen = false;
  let destroyed = false;
  let contentsDestroyed = false;
  let currentWindow;
  const listeners = new Map();
  const handlers = new Map();
  const sent = [];
  const sender = {};
  const win = {
    isDestroyed: () => destroyed,
    isFullScreen: () => fullScreen,
    on: (event, listener) => listeners.set(event, listener),
    webContents: {
      isDestroyed: () => contentsDestroyed,
      send: (...args) => sent.push(args),
    },
  };
  currentWindow = win;
  const exports = {};
  const module = { exports };
  runInNewContext(outputFiles[0].text, {
    module,
    exports,
    require: name => {
      assert.equal(name, 'electron');
      return {
        BrowserWindow: {
          fromWebContents: value => {
            assert.equal(value, sender);
            return currentWindow;
          },
        },
        ipcMain: {
          handle: (channel, handler) => handlers.set(channel, handler),
        },
      };
    },
  });
  const chrome = module.exports;
  assert.deepEqual(
    { ...chrome.MACOS_TRAFFIC_LIGHT_POSITION },
    { x: 12, y: 23 }
  );
  chrome.bindWindowFullScreenState(win);
  fullScreen = true;
  listeners.get('enter-full-screen')();
  fullScreen = false;
  listeners.get('leave-full-screen')();
  assert.deepEqual(sent, [
    ['desktop-full-screen-changed', true],
    ['desktop-full-screen-changed', false],
  ]);
  contentsDestroyed = true;
  listeners.get('enter-full-screen')();
  contentsDestroyed = false;
  destroyed = true;
  listeners.get('leave-full-screen')();
  assert.equal(sent.length, 2);
  chrome.registerFullScreenStateIpc(event => event.sender === sender);
  const snapshot = handlers.get('desktop-get-full-screen-state');
  assert.equal(snapshot({ sender: {} }), false);

  assert.equal(snapshot({ sender }), false);
  destroyed = false;
  fullScreen = true;
  assert.equal(snapshot({ sender }), true);
  fullScreen = false;
  assert.equal(snapshot({ sender }), false);
  currentWindow = undefined;
  assert.equal(snapshot({ sender }), false);
});

// Keep source contracts bound to the imported native/renderer token owners.
async function readWindowChromeSource() {
  const main = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');
  assert.match(main, /from '\.\/window-chrome';/);
  assert.match(main, /bindWindowFullScreenState\(win\)/);
  assert.match(main, /registerFullScreenStateIpc\(isTrustedIpcSender\)/);
  return (
    main +
    '\n' +
    (await readFile(join(desktopRoot, 'src/window-chrome.ts'), 'utf8'))
  );
}

async function readElectronChromeCss(webRoot) {
  const globalCss = await readFile(join(webRoot, 'app/globals.css'), 'utf8');
  assert.match(globalCss, /@import "\.\.\/styles\/electron-chrome\.css";/);
  return (
    globalCss +
    '\n' +
    (await readFile(join(webRoot, 'styles/electron-chrome.css'), 'utf8'))
  );
}
