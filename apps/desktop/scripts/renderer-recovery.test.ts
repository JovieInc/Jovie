import { afterEach, expect, test, vi } from 'vitest';
import {
  classifyDesktopLoadFailure,
  createLocalHostedLoadRetryController,
  decideAbortedMainFrameRecovery,
  decideDidFinishLoadRecovery,
  decideHostedLoadRetry,
  decideLocalMainFrameLoadFailure,
  decideRecoveryUnlatch,
  decideRendererBootWatchdogAfterLoad,
  decideRendererLoadStart,
  decideRendererRecovery,
  decideRendererWatchdogExpiry,
  describeDesktopLoadFailure,
  hostedUrlCandidates,
  isChromiumErrorDocument,
  isLocalDevSiblingOrigin,
  isLoopbackAppUrl,
  LOCAL_HOSTED_LOAD_RETRY_DELAY_MS,
  LOCAL_HOSTED_LOAD_RETRY_LIMIT,
  LOCAL_RENDERER_BOOT_WATCHDOG_MS,
  LOCAL_RENDERER_LOAD_WATCHDOG_MS,
  parseDidStartNavigation,
  RENDERER_BOOT_WATCHDOG_MS,
  RENDERER_LOAD_WATCHDOG_MS,
  rendererWatchdogMs,
  shouldArmRendererBootWatchdog,
  shouldArmRendererWatchdogsForAppEnv,
  shouldRecoverAuthHandoffToCanonicalShell,
  shouldSkipRendererWatchdogForAuthHandoff,
} from '../src/renderer-recovery.ts';

const MAX = 2;

afterEach(() => {
  vi.useRealTimers();
});

test('a Chromium error document cannot cancel the bounded local retry obligation', () => {
  vi.useFakeTimers();
  const retriedUrls: string[] = [];
  const controller = createLocalHostedLoadRetryController({
    retry: url => retriedUrls.push(url),
    isWindowDestroyed: () => false,
  });
  const retryUrl = 'http://localhost:3100/app/chat?runtime=electron';

  for (
    let attempt = 1;
    attempt <= LOCAL_HOSTED_LOAD_RETRY_LIMIT;
    attempt += 1
  ) {
    expect(
      controller.onMainFrameLoadFailure({ errorCode: -102, retryUrl })
    ).toEqual({ action: 'retry', attempt });

    // Chromium finishes chrome-error://chromewebdata/ after did-fail-load.
    // That internal document must not reset the count or cancel this timer.
    controller.onMainFrameDocumentCommitted({ isHostedAppDocument: false });
    vi.advanceTimersByTime(LOCAL_HOSTED_LOAD_RETRY_DELAY_MS);
    expect(retriedUrls).toHaveLength(attempt);
  }

  expect(
    controller.onMainFrameLoadFailure({ errorCode: -102, retryUrl })
  ).toEqual({
    action: 'failure-page',
    attempt: LOCAL_HOSTED_LOAD_RETRY_LIMIT,
  });
  controller.onMainFrameDocumentCommitted({ isHostedAppDocument: false });
  vi.runOnlyPendingTimers();
  expect(retriedUrls).toHaveLength(LOCAL_HOSTED_LOAD_RETRY_LIMIT);
});

test('a stale splash finish after retry start cannot reset the retry budget', () => {
  vi.useFakeTimers();
  const retriedUrls: string[] = [];
  const controller = createLocalHostedLoadRetryController({
    retry: url => retriedUrls.push(url),
    isWindowDestroyed: () => false,
  });
  const retryUrl = 'http://localhost:3100/app/chat?runtime=electron';

  expect(
    controller.onMainFrameLoadFailure({ errorCode: -102, retryUrl })
  ).toEqual({ action: 'retry', attempt: 1 });
  controller.onMainFrameDocumentCommitted({ isHostedAppDocument: false });
  vi.advanceTimersByTime(LOCAL_HOSTED_LOAD_RETRY_DELAY_MS);
  expect(retriedUrls).toEqual([retryUrl]);

  // The splash/error document can complete after the hosted retry starts.
  // Only a positively identified app-origin document may complete recovery.
  expect(
    controller.onMainFrameDocumentCommitted({ isHostedAppDocument: false })
  ).toBe('preserve-retry');
  expect(
    controller.onMainFrameLoadFailure({ errorCode: -102, retryUrl })
  ).toEqual({ action: 'retry', attempt: 2 });
});

test('a successful hosted retry completes and resets the local recovery obligation', () => {
  vi.useFakeTimers();
  const controller = createLocalHostedLoadRetryController({
    retry: () => undefined,
    isWindowDestroyed: () => false,
  });
  const retryUrl = 'http://localhost:3100/app/chat?runtime=electron';

  expect(
    controller.onMainFrameLoadFailure({ errorCode: -102, retryUrl })
  ).toEqual({ action: 'retry', attempt: 1 });
  expect(
    controller.onMainFrameDocumentCommitted({ isHostedAppDocument: false })
  ).toBe('preserve-retry');
  vi.advanceTimersByTime(LOCAL_HOSTED_LOAD_RETRY_DELAY_MS);
  expect(
    controller.onMainFrameDocumentCommitted({ isHostedAppDocument: true })
  ).toBe('complete-retry');

  expect(
    controller.onMainFrameLoadFailure({ errorCode: -102, retryUrl })
  ).toEqual({ action: 'retry', attempt: 1 });
});

test('a manual hosted reload completes recovery and cancels the stale retry timer', () => {
  vi.useFakeTimers();
  const retriedUrls: string[] = [];
  const controller = createLocalHostedLoadRetryController({
    retry: url => retriedUrls.push(url),
    isWindowDestroyed: () => false,
  });
  const retryUrl = 'http://localhost:3100/app/chat?runtime=electron';

  expect(
    controller.onMainFrameDocumentCommitted({ isHostedAppDocument: true })
  ).toBe('ignore');
  expect(
    controller.onMainFrameLoadFailure({ errorCode: -102, retryUrl })
  ).toEqual({ action: 'retry', attempt: 1 });
  expect(
    controller.onMainFrameDocumentCommitted({ isHostedAppDocument: false })
  ).toBe('preserve-retry');

  expect(
    controller.onMainFrameDocumentCommitted({ isHostedAppDocument: true })
  ).toBe('complete-retry');
  vi.advanceTimersByTime(LOCAL_HOSTED_LOAD_RETRY_DELAY_MS);

  expect(retriedUrls).toEqual([]);
});

test('a failed manual reload replaces rather than overlaps the pending retry', () => {
  vi.useFakeTimers();
  const retriedUrls: string[] = [];
  const controller = createLocalHostedLoadRetryController({
    retry: url => retriedUrls.push(url),
    isWindowDestroyed: () => false,
  });
  const retryUrl = 'http://localhost:3100/app/chat?runtime=electron';

  expect(
    controller.onMainFrameLoadFailure({ errorCode: -102, retryUrl })
  ).toEqual({ action: 'retry', attempt: 1 });
  controller.onMainFrameDocumentCommitted({ isHostedAppDocument: false });
  expect(
    controller.onMainFrameLoadFailure({ errorCode: -102, retryUrl })
  ).toEqual({ action: 'retry', attempt: 2 });
  controller.onMainFrameDocumentCommitted({ isHostedAppDocument: false });
  vi.advanceTimersByTime(LOCAL_HOSTED_LOAD_RETRY_DELAY_MS);

  expect(retriedUrls).toEqual([retryUrl]);
});

test('a destroyed local window never executes its pending hosted retry', () => {
  vi.useFakeTimers();
  const retriedUrls: string[] = [];
  const controller = createLocalHostedLoadRetryController({
    retry: url => retriedUrls.push(url),
    isWindowDestroyed: () => true,
  });

  controller.onMainFrameLoadFailure({
    errorCode: -102,
    retryUrl: 'http://localhost:3100/app/chat?runtime=electron',
  });
  controller.onMainFrameDocumentCommitted({ isHostedAppDocument: false });
  vi.advanceTimersByTime(LOCAL_HOSTED_LOAD_RETRY_DELAY_MS);

  expect(retriedUrls).toEqual([]);
});

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
  expect(
    shouldArmRendererBootWatchdog('chrome-error://chromewebdata/', appOrigin)
  ).toBe(false);
  expect(shouldArmRendererBootWatchdog('file:///tmp/x.html', appOrigin)).toBe(
    false
  );
  expect(shouldArmRendererBootWatchdog('not a url', appOrigin)).toBe(false);
});

test('local shells skip packaged boot/load watchdogs', () => {
  expect(shouldArmRendererWatchdogsForAppEnv('local')).toBe(false);
  expect(shouldArmRendererWatchdogsForAppEnv('staging')).toBe(true);
  expect(shouldArmRendererWatchdogsForAppEnv('production')).toBe(true);
});

test('local connection-refused retries until the budget is exhausted', () => {
  expect(LOCAL_HOSTED_LOAD_RETRY_LIMIT).toBe(30);
  expect(LOCAL_HOSTED_LOAD_RETRY_DELAY_MS).toBe(2_000);

  expect(
    decideLocalMainFrameLoadFailure({ errorCode: -102, retryCount: 0 })
  ).toBe('retry');
  expect(
    decideLocalMainFrameLoadFailure({
      errorCode: -102,
      retryCount: LOCAL_HOSTED_LOAD_RETRY_LIMIT - 1,
    })
  ).toBe('retry');
  expect(
    decideLocalMainFrameLoadFailure({
      errorCode: -102,
      retryCount: LOCAL_HOSTED_LOAD_RETRY_LIMIT,
    })
  ).toBe('failure-page');
  expect(
    decideLocalMainFrameLoadFailure({ errorCode: -2, retryCount: 0 })
  ).toBe('failure-page');
});

test('a Chromium error document must not cancel a pending local retry (JOV-5474)', () => {
  expect(isChromiumErrorDocument('chrome-error://chromewebdata/')).toBe(true);
  expect(isChromiumErrorDocument('http://localhost:3100/app/chat')).toBe(false);
  expect(isChromiumErrorDocument('data:text/html;charset=utf-8,recovery')).toBe(
    false
  );

  let retryCount = 0;
  let retryTimerArmed = false;

  const onDidFailLoad = (errorCode: number): void => {
    const action = decideLocalMainFrameLoadFailure({
      errorCode,
      retryCount,
    });
    if (action === 'retry') {
      retryCount += 1;
      retryTimerArmed = true;
    }
  };

  const onDidFinishLoad = (url: string): void => {
    // Deliberate-red on current main: unconditional did-finish-load resets
    // localHostedLoadRetryCount and clearAllWatchdogs() cancels the timer.
    if (decideDidFinishLoadRecovery({ url }) === 'ignore') return;
    retryCount = 0;
    retryTimerArmed = false;
  };

  // Exact-current Jovie Local event order: localhost:3100 refuses, then
  // Chromium commits chrome-error://chromewebdata/.
  onDidFailLoad(-102);
  onDidFinishLoad('chrome-error://chromewebdata/');

  expect(retryCount).toBe(1);
  expect(retryTimerArmed).toBe(true);
  expect(decideLocalMainFrameLoadFailure({ errorCode: -102, retryCount })).toBe(
    'retry'
  );

  // Cmd-R reproduces the same chrome-error finish without a hosted load.
  onDidFinishLoad('chrome-error://chromewebdata/');
  expect(retryCount).toBe(1);
  expect(retryTimerArmed).toBe(true);

  // A verified hosted finish still clears the local retry budget.
  onDidFinishLoad('http://localhost:3100/app/chat');
  expect(retryCount).toBe(0);
  expect(retryTimerArmed).toBe(false);
  expect(
    decideDidFinishLoadRecovery({
      url: 'http://localhost:3100/app/chat',
    })
  ).toBe('hosted-finished');
  expect(
    decideDidFinishLoadRecovery({
      url: 'data:text/html;charset=utf-8,recovery',
    })
  ).toBe('hosted-finished');
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
