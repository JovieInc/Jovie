import { expect, test } from 'vitest';
import {
  applyWakeRendererRecovery,
  createRecoverAfterWake,
  DESKTOP_LOAD_FAILURE_DOCUMENT_MARKER,
  decideWakeRendererRecovery,
  isDesktopBootSplashDocument,
  isDesktopLoadFailureDocument,
  recoverDesktopWindowAfterWake,
  scheduleWakeRendererRecovery,
} from '../src/renderer-wake-recovery.ts';

test('wake recovery heals blank, chrome-error, splash, and failure shells', () => {
  const appOrigin = 'https://jov.ie';
  const failureHtml = `<main ${DESKTOP_LOAD_FAILURE_DOCUMENT_MARKER}></main>`;
  const failureUrl = `data:text/html;charset=utf-8,${encodeURIComponent(failureHtml)}`;
  const splashHtml = `<main data-desktop-splash="cinematic"></main>`;
  const splashUrl = `data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`;

  expect(isDesktopLoadFailureDocument(failureUrl)).toBe(true);
  expect(isDesktopBootSplashDocument(splashUrl)).toBe(true);
  expect(isDesktopLoadFailureDocument(splashUrl)).toBe(false);

  expect(
    decideWakeRendererRecovery({
      windowDestroyed: true,
      currentUrl: 'about:blank',
      rendererBooted: false,
      rendererCrashed: false,
      appOrigin,
    })
  ).toBe('ignore');

  expect(
    decideWakeRendererRecovery({
      windowDestroyed: false,
      currentUrl: 'https://jov.ie/app/chat',
      rendererBooted: true,
      rendererCrashed: false,
      appOrigin,
    })
  ).toBe('ignore');

  expect(
    decideWakeRendererRecovery({
      windowDestroyed: false,
      currentUrl: failureUrl,
      rendererBooted: false,
      rendererCrashed: false,
      appOrigin,
    })
  ).toBe('begin-unlatch');

  expect(
    decideWakeRendererRecovery({
      windowDestroyed: false,
      currentUrl: 'chrome-error://chromewebdata/',
      rendererBooted: false,
      rendererCrashed: false,
      appOrigin,
    })
  ).toBe('reload-hosted');

  expect(
    decideWakeRendererRecovery({
      windowDestroyed: false,
      currentUrl: 'about:blank',
      rendererBooted: false,
      rendererCrashed: false,
      appOrigin,
    })
  ).toBe('reload-hosted');

  expect(
    decideWakeRendererRecovery({
      windowDestroyed: false,
      currentUrl: splashUrl,
      rendererBooted: false,
      rendererCrashed: false,
      appOrigin,
    })
  ).toBe('reload-hosted');

  expect(
    decideWakeRendererRecovery({
      windowDestroyed: false,
      currentUrl: 'https://jov.ie/app/chat',
      rendererBooted: false,
      rendererCrashed: false,
      appOrigin,
    })
  ).toBe('reload-hosted');

  expect(
    decideWakeRendererRecovery({
      windowDestroyed: false,
      currentUrl: 'https://jov.ie/app/chat',
      rendererBooted: true,
      rendererCrashed: true,
      appOrigin,
    })
  ).toBe('reload-hosted');
});

test('wake scheduler binds resume and unlock once each', () => {
  const events: string[] = [];
  let recoverCount = 0;
  scheduleWakeRendererRecovery({
    powerMonitor: {
      on(event, listener) {
        events.push(event);
        if (event === 'resume') listener();
      },
    },
    recover: () => {
      recoverCount += 1;
    },
  });
  expect(events).toEqual(['resume', 'unlock-screen']);
  expect(recoverCount).toBe(1);
});

test('applyWakeRendererRecovery only acts on non-ignore decisions', () => {
  let unlatch = 0;
  let reload = 0;
  applyWakeRendererRecovery({
    action: 'ignore',
    beginUnlatch: () => {
      unlatch += 1;
    },
    reloadHosted: () => {
      reload += 1;
    },
  });
  applyWakeRendererRecovery({
    action: 'begin-unlatch',
    beginUnlatch: () => {
      unlatch += 1;
    },
    reloadHosted: () => {
      reload += 1;
    },
  });
  applyWakeRendererRecovery({
    action: 'reload-hosted',
    beginUnlatch: () => {
      unlatch += 1;
    },
    reloadHosted: () => {
      reload += 1;
    },
  });
  expect(unlatch).toBe(1);
  expect(reload).toBe(1);
});

test('createRecoverAfterWake reloads a blank unbooted window', () => {
  let reload = 0;
  const recover = createRecoverAfterWake({
    isDestroyed: () => false,
    getCurrentUrl: () => 'about:blank',
    isRendererBooted: () => false,
    isRendererCrashed: () => false,
    appOrigin: 'https://jov.ie',
    beginUnlatch: () => undefined,
    reloadHosted: () => {
      reload += 1;
    },
  });
  recover();
  expect(reload).toBe(1);
});

test('recoverDesktopWindowAfterWake skips auth handoff and destroyed windows', () => {
  let calls = 0;
  recoverDesktopWindowAfterWake({
    isAuthHandoffInteractive: () => true,
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: { id: 1 },
    }),
    getController: () => ({
      recoverAfterWake: () => {
        calls += 1;
      },
    }),
  });
  expect(calls).toBe(0);

  recoverDesktopWindowAfterWake({
    isAuthHandoffInteractive: () => false,
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: { id: 7 },
    }),
    getController: id =>
      id === 7
        ? {
            recoverAfterWake: () => {
              calls += 1;
            },
          }
        : undefined,
  });
  expect(calls).toBe(1);
});
