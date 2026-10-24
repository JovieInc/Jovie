/** Automated source-host evidence only. Never packaged production acceptance. */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  _electron,
  type ElectronApplication,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '../../constants/routes';
import {
  assertCompleteSamples,
  assertForeground,
  assertSourceIdentity,
  requireWindow,
} from '../../scripts/performance-electron-contract';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
} from '../../scripts/performance-interaction-report';
import { setTestAuthBypassSession } from '../helpers/auth';
import { roundTripCopy } from '../helpers/chat-performance-probe';
import {
  chatStreamResponse,
  exchangeChatRoundTrip,
  installChatProbe,
  measureChatScrollFrames,
  mockChatBackend,
  readChatProbe,
  remountChatRoute,
  SAMPLE_COUNT,
  trackChatApiRequests,
  triggerMeasuredSend,
  WARMUP_ROUND_TRIPS,
  waitForChatRouteReady,
} from '../helpers/chat-performance-scenario';

const repo = resolve(__dirname, '../../../..');
const desktop = resolve(repo, 'apps/desktop');
const standalone = resolve(repo, 'apps/web/.next/standalone/apps/web');
const output = resolve(
  process.env.ELECTRON_CHAT_REPORT ?? '/tmp/jovie-electron-chat-report.json'
);
const children: ChildProcess[] = [];
let electron: ElectronApplication | undefined;
let profile: string | undefined;
const receipts: unknown[] = [];
let host: unknown;
let status = 'fail';
let failure: string | undefined;

function run(command: string, args: string[], env = process.env) {
  execFileSync(command, args, {
    cwd: repo,
    env,
    timeout: 60_000,
    stdio: 'inherit',
  });
}

async function port() {
  const server = createServer();
  await new Promise<void>(resolvePort =>
    server.listen(0, '127.0.0.1', resolvePort)
  );
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing loopback port');
  await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  return address.port;
}

async function main() {
  // A clean source head is necessary to call these exact-SHA receipts.
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim();
  if (
    execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim()
  )
    throw new Error('Commit source changes before measuring an exact SHA');
  const build = JSON.parse(
    await readFile(
      resolve(standalone, '.next/required-server-files.json'),
      'utf8'
    )
  );
  const serverSha = build.config.env.NEXT_PUBLIC_SENTRY_RELEASE;
  if (serverSha !== sha)
    throw new Error('Standalone server was not built from this exact SHA');
  profile = await mkdtemp(resolve(tmpdir(), 'jovie-chat-source-'));
  const serverPort = await port();
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  const server = spawn(process.execPath, [resolve(standalone, 'server.js')], {
    cwd: standalone,
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(serverPort),
      HOSTNAME: '127.0.0.1',
      E2E_USE_TEST_AUTH_BYPASS: '1',
    },
  });
  children.push(server);
  let servedBuildId = '';
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null)
      throw new Error('Standalone server exited before readiness');
    try {
      const response = await fetch(`${baseUrl}/api/version`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        servedBuildId = (await response.json()).buildId;
        break;
      }
    } catch {
      /* bounded server startup */
    }
    await delay(250);
  }
  if (!servedBuildId) throw new Error('Standalone server readiness timed out');
  const env = {
    ...process.env,
    ELECTRON_ENV: 'local',
    ELECTRON_APP_URL: baseUrl,
    JOVIE_DESKTOP_SOURCE_REVISION: sha,
  };
  run('node', ['apps/desktop/scripts/write-env.mjs'], env);
  run('pnpm', ['--filter', '@jovie/desktop', 'compile'], env);
  const requireDesktop = createRequire(resolve(desktop, 'package.json'));
  electron = await _electron.launch({
    executablePath: requireDesktop('electron'),
    args: [desktop],
    cwd: desktop,
    env: { ...env, JOVIE_DEV: '1', JOVIE_DEV_USER_DATA_DIR: profile },
    timeout: 30_000,
  });
  children.push(electron.process());
  await electron.firstWindow({ timeout: 30_000 });
  const page = requireWindow(electron.windows());
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  let rendererLost = false;
  page.on('crash', () => {
    rendererLost = true;
  });
  page.on('close', () => {
    rendererLost = true;
  });
  const native = await electron.browserWindow(page);
  await native.evaluate(window => window.setContentSize(1280, 480));
  const monitor = await native.evaluateHandle(window => {
    const state = { interruptions: 0, measuring: false, rendererLost: false };
    for (const event of ['hide', 'minimize', 'blur', 'closed'] as const)
      window.on(event, () => {
        if (state.measuring) state.interruptions++;
      });
    window.webContents.on('render-process-gone', () => {
      state.rendererLost = true;
    });
    return { window, state };
  });
  const identity = await electron.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    actualProfile: app.getPath('userData'),
    appPath: app.getAppPath(),
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome,
    backgroundOverrides: [
      'disable-background-timer-throttling',
      'disable-backgrounding-occluded-windows',
      'disable-renderer-backgrounding',
    ].filter(flag => app.commandLine.hasSwitch(flag)),
  }));
  const baked = JSON.parse(
    await readFile(resolve(profile, 'build-identity.json'), 'utf8')
  );
  assertSourceIdentity({
    expectedSha: sha,
    serverSha,
    servedBuildId,
    desktopSha: baked.sourceRevision,
    packaged: identity.packaged,
    actualProfile: identity.actualProfile,
    expectedProfile: profile,
  });
  if (identity.backgroundOverrides.length)
    throw new Error('Electron scheduling overrides remain enabled');
  if (identity.appPath !== desktop)
    throw new Error('Wrong Electron source application');
  host = {
    ...identity,
    sourceRevision: sha,
    serverSha,
    servedBuildId,
    platform: process.platform,
    workload: {
      viewport: '1280x480',
      warmups: WARMUP_ROUND_TRIPS,
      samples: SAMPLE_COUNT,
      network: 'deterministic-chat',
      cpu: 'unthrottled',
    },
  };
  process.env.BASE_URL = baseUrl;
  process.env.E2E_USE_TEST_AUTH_BYPASS = '1';
  await page.setViewportSize({ width: 1280, height: 480 });
  await mockChatBackend(page);
  const chatApi = trackChatApiRequests(page);
  async function foreground() {
    await native.evaluate(window => {
      window.restore();
      window.show();
      window.focus();
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.visibilityState === 'visible' && document.hasFocus()
        )
      )
      .toBe(true);
  }
  async function measure<
    T extends { frameCount: number; rendererHidden: boolean },
  >(action: () => Promise<T>) {
    await foreground();
    await monitor.evaluate(({ state }) => {
      state.interruptions = 0;
      state.measuring = true;
    });
    try {
      const result = await action();
      const receipt = await monitor.evaluate(({ window, state }) => ({
        visible: window.isVisible(),
        focused: window.isFocused(),
        minimized: window.isMinimized(),
        destroyed: window.isDestroyed(),
        rendererLost: state.rendererLost,
        interruptions: state.interruptions,
      }));
      const foregroundReceipt = {
        ...receipt,
        rendererLost: receipt.rendererLost || rendererLost,
        rendererHidden: result.rendererHidden,
        frameCount: result.frameCount,
      };
      assertForeground(foregroundReceipt);
      return { result, foreground: foregroundReceipt };
    } finally {
      await monitor.evaluate(({ state }) => {
        state.measuring = false;
      });
    }
  }
  let budgetsPassed = true;
  for (const door of [
    { id: 'jovie', route: APP_ROUTES.CHAT, persona: 'creator-ready' },
    { id: 'ovie', route: APP_ROUTES.ADMIN_CHAT, persona: 'admin' },
  ] as const) {
    await setTestAuthBypassSession(page, door.persona);
    await page.goto(`${baseUrl}${door.route}`, {
      waitUntil: 'domcontentloaded',
    });
    const content = page.getByTestId('chat-content').last();
    const composer = content.locator(
      'textarea[aria-label="Chat Message Input"]'
    );
    const send = content.getByRole('button', { name: /send message/i });
    await foreground();
    await waitForChatRouteReady(page, content, composer, chatApi);
    const samples: InteractionLatencySample[] = [];
    const foregrounds = [];
    for (let index = -WARMUP_ROUND_TRIPS; index < SAMPLE_COUNT; index++) {
      await remountChatRoute(
        page,
        content,
        composer,
        chatApi,
        `${baseUrl}${door.route}`
      );
      const copy = roundTripCopy(
        index < 0 ? 'Warmup' : 'Performance',
        index < 0 ? index + WARMUP_ROUND_TRIPS : index
      );
      if (index < 0) {
        await foreground();
        await exchangeChatRoundTrip(
          page,
          composer,
          send,
          copy.userText,
          copy.assistantText
        );
        continue;
      }
      const measured = await measure(async () => {
        const timing = await exchangeChatRoundTrip(
          page,
          composer,
          send,
          copy.userText,
          copy.assistantText
        );
        return {
          ...timing,
          ...(await measureChatScrollFrames(page)),
        };
      });
      if (index >= 0) {
        samples.push({
          ...measured.result,
          scenarioId: 'chat-message-round-trip',
          runIndex: index,
        });
        foregrounds.push(measured.foreground);
      }
    }
    assertCompleteSamples(samples, SAMPLE_COUNT);
    const report = buildInteractionLatencyReport({
      samples,
      metadata: {
        browser: identity.electronVersion,
        baseUrl,
        buildMode: 'test',
        sampleCount: SAMPLE_COUNT,
      },
    });
    budgetsPassed &&= report.status === 'pass';
    receipts.push({
      door: door.id,
      workload: 'chat-message-round-trip',
      foregrounds,
      report,
    });
    // Live SSE stays open across native hide/restore; hidden frames are never scored.
    await remountChatRoute(
      page,
      content,
      composer,
      chatApi,
      `${baseUrl}${door.route}`
    );
    const restoration = await restoreDuringStream(
      page,
      baseUrl,
      () => native.evaluate(window => window.hide()),
      foreground,
      async () =>
        measure(async () => {
          const frames = await measureChatScrollFrames(page);
          if (frames.droppedFrameCount !== 0)
            throw new Error('Dropped foreground restoration frames');
          return frames;
        })
    );
    receipts.push({
      door: door.id,
      workload: 'foreground-restoration-active-stream',
      ...restoration,
    });
  }
  status = budgetsPassed ? 'pass' : 'fail';
}

async function restoreDuringStream(
  page: Page,
  origin: string,
  hide: () => Promise<void>,
  foreground: () => Promise<void>,
  measure: () => Promise<unknown>
) {
  const copy = roundTripCopy('Performance', 99);
  const wire = chatStreamResponse(99, copy.assistantText);
  let finish: (() => void) | undefined;
  let chunks = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const fixture = createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'x-vercel-ai-ui-message-stream': 'v1',
    });
    const split = wire.indexOf('data: {"type":"text-end"');
    response.write(wire.slice(0, split));
    timer = setInterval(() => {
      response.write(
        `data: ${JSON.stringify({ type: 'text-delta', id: 'text-chat-performance-99', delta: ' live' })}\n\n`
      );
      chunks++;
    }, 40);
    finish = () => {
      clearInterval(timer);
      response.end(wire.slice(split));
    };
  });
  await new Promise<void>(listen => fixture.listen(0, '127.0.0.1', listen));
  const address = fixture.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing stream fixture');
  const forward = (route: import('@playwright/test').Route) =>
    route.continue({ url: `http://127.0.0.1:${address.port}/api/chat` });
  await page.route('**/api/chat', forward);
  try {
    const composer = page
      .locator('textarea[aria-label="Chat Message Input"]')
      .last();
    await composer.fill(copy.userText);
    await installChatProbe(page, copy.userText, copy.assistantText);
    await triggerMeasuredSend(
      page.getByRole('button', { name: /send message/i }).last()
    );
    await expect(
      page
        .getByTestId('chat-message-reply')
        .filter({ hasText: copy.assistantText })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /stop/i }).last()
    ).toBeVisible();
    const beforeHide = chunks;
    await hide();
    await expect
      .poll(() => page.evaluate(() => document.visibilityState))
      .toBe('hidden');
    await delay(150);
    const hiddenChunks = chunks - beforeHide;
    if (hiddenChunks < 1) throw new Error('No streaming workload while hidden');
    await foreground();
    await expect(
      page.getByRole('button', { name: /stop/i }).last()
    ).toBeVisible();
    const frames = await measure();
    if (!finish) throw new Error('Stream was not active at restoration');
    finish();
    await readChatProbe(page);
    await expect(composer).toBeEnabled();
    if (chunks - beforeHide <= hiddenChunks)
      throw new Error('Stream did not advance after restoration');
    return {
      frames,
      hiddenChunks,
      restoredChunks: chunks - beforeHide - hiddenChunks,
      streamingAcrossRestoration: true,
      hiddenFramesScored: false,
    };
  } finally {
    clearInterval(timer);
    finish?.();
    fixture.closeAllConnections();
    await new Promise<void>(closed => fixture.close(() => closed()));
    await page.unroute('**/api/chat', forward);
  }
}

test('measures the existing Electron chat host', async () => {
  const watchdog = setTimeout(() => {
    failure = 'deadline-exceeded';
    for (const child of children) child.kill('SIGKILL');
  }, 450_000);
  try {
    await main();
  } catch (error) {
    failure = error instanceof Error ? error.message : 'source-host failure';
  } finally {
    await Promise.race([electron?.close().catch(() => undefined), delay(3000)]);
    for (const child of children) child.kill('SIGKILL');
    if (profile) await rm(profile, { recursive: true, force: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          evidenceClass: 'automated-source-host',
          acceptance: 'diagnostic-first-slice',
          status,
          failure,
          host,
          receipts,
        },
        null,
        2
      ),
      { mode: 0o600 }
    );
    clearTimeout(watchdog);
  }
  expect(status, failure).toBe('pass');
});
