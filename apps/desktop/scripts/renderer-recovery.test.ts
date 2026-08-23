import { expect, test } from 'vitest';
import {
  classifyDesktopLoadFailure,
  decideAbortedMainFrameRecovery,
  decideHostedLoadRetry,
  decideRecoveryUnlatch,
  decideRendererBootWatchdogAfterLoad,
  decideRendererLoadStart,
  decideRendererRecovery,
  decideRendererWatchdogExpiry,
  describeDesktopLoadFailure,
  hostedUrlCandidates,
  isLocalDevSiblingOrigin,
  isLoopbackAppUrl,
  LOCAL_RENDERER_BOOT_WATCHDOG_MS,
  LOCAL_RENDERER_LOAD_WATCHDOG_MS,
  parseDidStartNavigation,
  RENDERER_BOOT_WATCHDOG_MS,
  RENDERER_LOAD_WATCHDOG_MS,
  rendererWatchdogMs,
  shouldArmRendererBootWatchdog,
  shouldRecoverAuthHandoffToCanonicalShell,
  shouldSkipRendererWatchdogForAuthHandoff,
} from '../src/renderer-recovery.ts';

const MAX = 2;

test('clean-exit is normal teardown, never recovered', () => {
  expect(
    decideRendererRecovery({
      reason: 'clean-exit',
      reloadCount: 0,
      maxReloads: MAX,
    })
  ).toBe('ignore');
});

test('canceling auth recovers an intercepted blank main window to the canonical shell', () => {
  expect(shouldRecoverAuthHandoffToCanonicalShell('about:blank')).toBe(true);
  expect(shouldRecoverAuthHandoffToCanonicalShell('')).toBe(true);
  expect(
    shouldRecoverAuthHandoffToCanonicalShell('https://jov.ie/app/chat')
  ).toBe(false);
  expect(
    shouldRecoverAuthHandoffToCanonicalShell('data:text/html,recovery')
  ).toBe(false);
});

test('a crash reloads while within the budget', () => {
  for (const reason of [
    'crashed',
    'oom',
    'killed',
    'abnormal-exit',
    'launch-failed',
  ]) {
    expect(
      decideRendererRecovery({ reason, reloadCount: 0, maxReloads: MAX })
    ).toBe('reload');
    expect(
      decideRendererRecovery({ reason, reloadCount: MAX - 1, maxReloads: MAX })
    ).toBe('reload');
  }
});

test('a crash loop falls back to the failure page instead of black', () => {
  expect(
    decideRendererRecovery({
      reason: 'crashed',
      reloadCount: MAX,
      maxReloads: MAX,
    })
  ).toBe('failure-page');
  expect(
    decideRendererRecovery({
      reason: 'oom',
      reloadCount: MAX + 5,
      maxReloads: MAX,
    })
  ).toBe('failure-page');
});

test('boot watchdog arms only for real hosted app-origin navigations', () => {
  expect(RENDERER_BOOT_WATCHDOG_MS).toBeGreaterThanOrEqual(12_000);
  expect(RENDERER_BOOT_WATCHDOG_MS).toBeLessThanOrEqual(15_000);

  const appOrigin = 'https://jov.ie';
  expect(
    shouldArmRendererBootWatchdog(
      'https://jov.ie/app/chat?runtime=electron',
      appOrigin
    )
  ).toBe(true);
  expect(
    shouldArmRendererBootWatchdog(
      'http://localhost:3112/app',
      'http://localhost:3112'
    )
  ).toBe(true);
  expect(
    shouldArmRendererBootWatchdog(
      'http://localhost:3100/app/chat',
      'http://localhost:3112'
    )
  ).toBe(true);

  // Only the app origin ever sends app-booted — any other http(s) origin must
  // not arm the watchdog or it is a guaranteed false-positive.
  expect(
    shouldArmRendererBootWatchdog('https://docs.jov.ie/guide', appOrigin)
  ).toBe(false);
  expect(shouldArmRendererBootWatchdog('https://example.com', appOrigin)).toBe(
    false
  );

  expect(shouldArmRendererBootWatchdog('', appOrigin)).toBe(false);
  expect(shouldArmRendererBootWatchdog('about:blank', appOrigin)).toBe(false);
  expect(
    shouldArmRendererBootWatchdog('data:text/html,failure', appOrigin)
  ).toBe(false);
  expect(
    shouldArmRendererBootWatchdog('devtools://devtools/bundled', appOrigin)
  ).toBe(false);
  expect(shouldArmRendererBootWatchdog('file:///tmp/x.html', appOrigin)).toBe(
    false
  );
  expect(shouldArmRendererBootWatchdog('not a url', appOrigin)).toBe(false);
});

test('load watchdog covers hung navigation before did-finish-load', () => {
  expect(RENDERER_LOAD_WATCHDOG_MS).toBeGreaterThanOrEqual(15_000);
  expect(RENDERER_LOAD_WATCHDOG_MS).toBeLessThanOrEqual(20_000);
  expect(RENDERER_LOAD_WATCHDOG_MS).toBeGreaterThan(RENDERER_BOOT_WATCHDOG_MS);
});

test('recovery unlatches onto a warm local host without a Retry click', () => {
  expect(
    hostedUrlCandidates(
      'http://localhost:3112',
      'http://localhost:3112/app/chat'
    )
  ).toEqual([
    'http://localhost:3112/app/chat',
    'http://localhost:3100/app/chat',
  ]);
  expect(
    hostedUrlCandidates('https://jov.ie', 'https://jov.ie/app/chat')
  ).toEqual(['https://jov.ie/app/chat']);
  expect(
    isLocalDevSiblingOrigin(
      'http://localhost:3100/app/chat',
      'http://localhost:3112'
    )
  ).toBe(true);
  expect(
    isLocalDevSiblingOrigin(
      'http://localhost:3999/app',
      'http://localhost:3112'
    )
  ).toBe(false);
  expect(
    decideRecoveryUnlatch({
      showingFailurePage: true,
      booted: false,
      windowDestroyed: false,
      reachableHostedUrl: 'http://localhost:3100/app/chat',
    })
  ).toBe('reload-hosted');
  expect(
    decideRecoveryUnlatch({
      showingFailurePage: true,
      booted: true,
      windowDestroyed: false,
      reachableHostedUrl: 'http://localhost:3100/app/chat',
    })
  ).toBe('ignore');
  expect(
    decideRecoveryUnlatch({
      showingFailurePage: true,
      booted: false,
      windowDestroyed: false,
      reachableHostedUrl: null,
    })
  ).toBe('ignore');
});

test('local watchdogs wait out first Turbopack compile instead of painting recovery', () => {
  const measuredFirstCompileMs = 15_500;
  const local = rendererWatchdogMs('local');
  const production = rendererWatchdogMs('production');
  const staging = rendererWatchdogMs('staging');

  expect(local.loadMs).toBe(LOCAL_RENDERER_LOAD_WATCHDOG_MS);
  expect(local.bootMs).toBe(LOCAL_RENDERER_BOOT_WATCHDOG_MS);
  expect(local.loadMs).toBeGreaterThan(measuredFirstCompileMs);
  expect(local.bootMs).toBeGreaterThan(measuredFirstCompileMs);
  expect(local.loadMs).toBeGreaterThan(RENDERER_LOAD_WATCHDOG_MS);
  expect(local.bootMs).toBeGreaterThan(RENDERER_BOOT_WATCHDOG_MS);

  expect(production).toEqual({
    bootMs: RENDERER_BOOT_WATCHDOG_MS,
    loadMs: RENDERER_LOAD_WATCHDOG_MS,
  });
  expect(staging).toEqual(production);
});

test('a hung or intercepted hosted navigation arms the load watchdog', () => {
  const appOrigin = 'https://jov.ie';
  expect(
    decideRendererLoadStart({
      url: 'https://jov.ie/app/chat?runtime=electron',
      appOrigin,
      isMainFrame: true,
      isInPlace: false,
    })
  ).toBe('arm-load-watchdog');
  expect(
    decideRendererLoadStart({
      url: 'https://jov.ie/desktop-auth?auth_url=%2Fauth%2Fstart',
      appOrigin,
      isMainFrame: true,
      isInPlace: false,
    })
  ).toBe('arm-load-watchdog');

  expect(
    decideRendererLoadStart({
      url: 'https://jov.ie/app/chat?runtime=electron',
      appOrigin,
      isMainFrame: false,
      isInPlace: false,
    })
  ).toBe('ignore');
  expect(
    decideRendererLoadStart({
      url: 'https://jov.ie/app/chat#composer',
      appOrigin,
      isMainFrame: true,
      isInPlace: true,
    })
  ).toBe('ignore');
  expect(
    decideRendererLoadStart({
      url: 'data:text/html,splash',
      appOrigin,
      isMainFrame: true,
      isInPlace: false,
    })
  ).toBe('ignore');
  expect(
    decideRendererLoadStart({
      url: 'about:blank',
      appOrigin,
      isMainFrame: true,
      isInPlace: false,
    })
  ).toBe('ignore');
});

test('a previously painted session is not replaced by a false offline page', () => {
  expect(
    decideRendererWatchdogExpiry({
      booted: false,
      everBooted: true,
      reason: 'boot',
      windowDestroyed: false,
      skipForAuthHandoff: false,
    })
  ).toBe('ignore');
  expect(
    decideRendererWatchdogExpiry({
      booted: false,
      everBooted: true,
      reason: 'load',
      windowDestroyed: false,
      skipForAuthHandoff: false,
    })
  ).toBe('failure-page');
  expect(
    decideRendererWatchdogExpiry({
      booted: false,
      everBooted: false,
      reason: 'boot',
      windowDestroyed: false,
      skipForAuthHandoff: false,
    })
  ).toBe('failure-page');
});

test('load failures are classified honestly instead of as generic offline', () => {
  expect(isLoopbackAppUrl('http://localhost:3112')).toBe(true);
  expect(isLoopbackAppUrl('https://jov.ie')).toBe(false);

  expect(
    classifyDesktopLoadFailure({
      reason: 'did-fail-load',
      errorCode: -106,
      appEnv: 'local',
      appUrl: 'http://localhost:3112',
    })
  ).toBe('offline');
  expect(
    classifyDesktopLoadFailure({
      reason: 'did-fail-load',
      errorCode: -102,
      appEnv: 'local',
      appUrl: 'http://localhost:3112',
    })
  ).toBe('local-server-down');
  expect(
    classifyDesktopLoadFailure({
      reason: 'did-fail-load',
      errorCode: -102,
      appEnv: 'production',
      appUrl: 'https://jov.ie',
    })
  ).toBe('host-unreachable');
  expect(
    classifyDesktopLoadFailure({
      reason: 'boot-watchdog',
      appEnv: 'local',
      appUrl: 'http://localhost:3112',
      hostReachable: true,
    })
  ).toBe('timed-out');
  expect(
    classifyDesktopLoadFailure({
      reason: 'load-watchdog',
      appEnv: 'local',
      appUrl: 'http://localhost:3112',
      hostReachable: false,
    })
  ).toBe('local-server-down');
  expect(
    classifyDesktopLoadFailure({
      reason: 'crashed',
      appEnv: 'local',
      appUrl: 'http://localhost:3112',
    })
  ).toBe('crashed');

  expect(
    describeDesktopLoadFailure('offline', 'http://localhost:3112').body
  ).toBe('Check your connection, then try again.');
  expect(
    describeDesktopLoadFailure('local-server-down', 'http://localhost:3112')
      .body
  ).toBe('Local Jovie isn’t running at localhost:3112.');
  expect(
    describeDesktopLoadFailure('timed-out', 'http://localhost:3112').heading
  ).toBe('Jovie didn’t finish starting');

  expect(
    decideHostedLoadRetry({
      kind: 'local-server-down',
      retryCount: 0,
      maxRetries: 2,
    })
  ).toBe('retry');
  expect(
    decideHostedLoadRetry({
      kind: 'offline',
      retryCount: 0,
      maxRetries: 2,
    })
  ).toBe('failure-page');
  expect(
    decideHostedLoadRetry({
      kind: 'local-server-down',
      retryCount: 2,
      maxRetries: 2,
    })
  ).toBe('failure-page');
});

test('200-but-blank and hung load both expire to the failure page', () => {
  expect(
    decideRendererWatchdogExpiry({
      booted: false,
      windowDestroyed: false,
      skipForAuthHandoff: false,
    })
  ).toBe('failure-page');
  expect(
    decideRendererWatchdogExpiry({
      booted: true,
      windowDestroyed: false,
      skipForAuthHandoff: false,
    })
  ).toBe('ignore');
  expect(
    decideRendererWatchdogExpiry({
      booted: true,
      everBooted: true,
      reason: 'load',
      windowDestroyed: false,
      skipForAuthHandoff: false,
    })
  ).toBe('ignore');
  expect(
    decideRendererWatchdogExpiry({
      booted: false,
      windowDestroyed: true,
      skipForAuthHandoff: false,
    })
  ).toBe('ignore');
});

test('an early app-booted ping survives did-finish-load', () => {
  const appOrigin = 'https://jov.ie';

  expect(
    decideRendererBootWatchdogAfterLoad({
      booted: true,
      url: 'https://jov.ie/app/chat?runtime=electron',
      appOrigin,
    })
  ).toBe('already-booted');
  expect(
    decideRendererBootWatchdogAfterLoad({
      booted: false,
      url: 'https://jov.ie/app/chat?runtime=electron',
      appOrigin,
    })
  ).toBe('arm-boot-watchdog');
});

test('an open-but-invisible auth handoff does not suppress recovery', () => {
  expect(
    shouldSkipRendererWatchdogForAuthHandoff({
      handoffOpen: true,
      handoffVisible: false,
    })
  ).toBe(false);
  expect(
    shouldSkipRendererWatchdogForAuthHandoff({
      handoffOpen: false,
      handoffVisible: false,
    })
  ).toBe(false);
  expect(
    shouldSkipRendererWatchdogForAuthHandoff({
      handoffOpen: true,
      handoffVisible: true,
    })
  ).toBe(true);

  expect(
    decideRendererWatchdogExpiry({
      booted: false,
      windowDestroyed: false,
      skipForAuthHandoff: shouldSkipRendererWatchdogForAuthHandoff({
        handoffOpen: true,
        handoffVisible: false,
      }),
    })
  ).toBe('failure-page');
});

test('an aborted sign-in intercept without a visible handoff recovers the blank window', () => {
  expect(
    decideAbortedMainFrameRecovery({
      recoveredViaAuthHandoff: true,
      currentUrl: 'about:blank',
    })
  ).toBe('ignore');
  expect(
    decideAbortedMainFrameRecovery({
      recoveredViaAuthHandoff: false,
      currentUrl: 'about:blank',
    })
  ).toBe('canonical-auth-shell');
  expect(
    decideAbortedMainFrameRecovery({
      recoveredViaAuthHandoff: false,
      currentUrl: '',
    })
  ).toBe('canonical-auth-shell');
  expect(
    decideAbortedMainFrameRecovery({
      recoveredViaAuthHandoff: false,
      currentUrl: 'https://jov.ie/app/chat?runtime=electron',
    })
  ).toBe('arm-load-watchdog');
});

test('did-start-navigation parses both Electron event shapes', () => {
  expect(
    parseDidStartNavigation([
      {
        url: 'https://jov.ie/app/chat',
        isMainFrame: true,
        isSameDocument: false,
      },
    ])
  ).toEqual({
    url: 'https://jov.ie/app/chat',
    isMainFrame: true,
    isInPlace: false,
  });
  expect(
    parseDidStartNavigation([{}, 'https://jov.ie/app/chat', false, true])
  ).toEqual({
    url: 'https://jov.ie/app/chat',
    isMainFrame: true,
    isInPlace: false,
  });
  expect(parseDidStartNavigation([{}])).toBeNull();
  expect(parseDidStartNavigation([])).toBeNull();
});

test('crash-after-load without a booted ping exhausts the reload budget', () => {
  // Regression (JOV desktop QA): main.ts resets rendererCrashReloadCount only
  // in markRendererBooted, never on did-finish-load. A renderer that loads
  // fine and then crashes deterministically (OOM during hydration) must burn
  // through the budget and reach the failure page instead of looping reloads.
  let reloadCount = 0;
  const decisions: string[] = [];
  for (let i = 0; i < 4; i++) {
    const action = decideRendererRecovery({
      reason: 'oom',
      reloadCount,
      maxReloads: MAX,
    });
    decisions.push(action);
    if (action === 'reload') reloadCount += 1;
    // did-finish-load fires between crashes but must NOT reset reloadCount.
  }

  expect(decisions).toEqual([
    'reload',
    'reload',
    'failure-page',
    'failure-page',
  ]);
});
