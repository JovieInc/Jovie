#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
  blockingCaptureRuntimeFailures,
  buildCaptureArtifactPaths,
  CAPTURE_VIEWPORTS,
  CRITICAL_JOURNEY_CAPTURE_SCHEMA,
  capturePersonaForRoute,
  captureViewportNamesForRoute,
  isOvieCaptureRoute,
  MAX_CAPTURE_WORKERS,
  resolveCaptureJourneyId,
  resolveCaptureWorkerCount,
  runCapturePool,
  sanitizeCaptureText,
  summarizeScriptedCaptures,
  validateCaptureManifest,
  validateRoutesMatchChange,
} from './pr-visual-review.mjs';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const routes = JSON.parse(process.env.PR_VISUAL_ROUTES ?? '[]');
const outDir = process.env.PR_VISUAL_OUT ?? 'pr-visual-artifacts';
const isExactSha = value =>
  typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
const exactHead = (() => {
  if (isExactSha(process.env.PR_VISUAL_HEAD_SHA)) {
    return process.env.PR_VISUAL_HEAD_SHA;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    try {
      const event = JSON.parse(readFileSync(eventPath, 'utf8'));
      const pullRequestHead = event?.pull_request?.head?.sha;
      if (isExactSha(pullRequestHead)) return pullRequestHead;
    } catch {
      // Fall through to the runner SHA when the event payload is unavailable.
    }
  }

  return isExactSha(process.env.GITHUB_SHA) ? process.env.GITHUB_SHA : null;
})();
const viewports = CAPTURE_VIEWPORTS;
const AUTHENTICATED_SHELL_WAIT_MS = 30_000;
const NEW_CHAT_EMPTY_WAIT_MS = 15_000;
const CAPTURE_TIMEOUT_MS = 45_000;
const CIRCUIT_BREAKER_FAILURES = 2;
if (!Array.isArray(routes) || routes.length === 0)
  throw new Error('No routes supplied');
if (!exactHead)
  throw new Error('Critical-journey capture requires an exact source SHA');

/**
 * Next production streaming can paint the app-shell Suspense fallback
 * (unlabeled skeleton + aria-hidden greeting region) before
 * DashboardShellContent resolves. Capture must wait for the live
 * authenticated chrome, not the first HTML chunk. JOV-5387 New Chat evidence
 * also requires the loaded empty-state greeting, which is not aria-hidden.
 */
const OVIE_CHAT_PROMPT = 'What changed since I last looked?';

/** A canned UI message stream so Home -> conversation can be captured without a model. */
const OVIE_CHAT_STREAM = [
  { type: 'start', messageId: 'capture-assistant' },
  { type: 'text-start', id: 'capture-text' },
  {
    type: 'text-delta',
    id: 'capture-text',
    delta:
      'Nothing is blocking shipping. 96 merges landed today, one decision is waiting on you, and production is current.',
  },
  { type: 'text-end', id: 'capture-text' },
  { type: 'finish' },
]
  .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
  .concat('data: [DONE]\n\n')
  .join('');

/**
 * Ovie Home proof (Tim, 2026-10-25): the HUD itself, populated; in Full Screen
 * the shell main plane fills the display with the normal composer usable; a
 * sent message replaces the HUD with the conversation. Throws on any miss.
 */
async function assertOvieHome(page, route) {
  const fullscreen = route.includes('fullscreen=1');
  await page
    .getByTestId('ovie-company-home')
    .waitFor({ state: 'visible', timeout: AUTHENTICATED_SHELL_WAIT_MS });
  // Populated, not skeletons: a company tile with a measured value.
  if (ovieFixture)
    await page
      .getByTestId('ovie-tile-revenue')
      .waitFor({ state: 'visible', timeout: AUTHENTICATED_SHELL_WAIT_MS });
  if (fullscreen)
    await page
      .getByTestId('ovie-fullscreen')
      .waitFor({ state: 'visible', timeout: AUTHENTICATED_SHELL_WAIT_MS });
  // The composer is the normal shared one: visible, in the viewport, and the
  // topmost element at its own centre (nothing covers it), in both modes.
  await assertComposerUsable(page, fullscreen);
  if (fullscreen) await assertFullscreenGeometry(page);
  if (route.includes('capture=chat')) {
    const input = page.getByTestId('chat-input');
    await input.click();
    await page.keyboard.type(OVIE_CHAT_PROMPT);
    await page.keyboard.press('Enter');
    // The HUD disappears and the conversation takes the surface.
    await page
      .locator('[data-testid="chat-message-scroll"][data-surface="thread"]')
      .waitFor({ state: 'visible', timeout: AUTHENTICATED_SHELL_WAIT_MS });
    await page
      .getByText(OVIE_CHAT_PROMPT)
      .first()
      .waitFor({ state: 'visible', timeout: AUTHENTICATED_SHELL_WAIT_MS });
    const hudGone = await page.getByTestId('ovie-company-home').count();
    if (hudGone !== 0)
      throw new Error('The HUD is still mounted after a message was sent');
    await page.waitForTimeout(700);
    await assertComposerUsable(page, fullscreen);
    await page
      .getByTestId('chat-back-to-home-canvas')
      .waitFor({ state: 'visible', timeout: 5_000 });
    if (fullscreen) await assertMainPlaneFillsViewport(page);
  }
}

async function assertComposerUsable(page, fullscreen) {
  const result = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="chat-input"]');
    if (!input) return { found: false };
    const box = input.getBoundingClientRect();
    const top = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2
    );
    return {
      found: true,
      inViewport:
        box.width > 0 &&
        box.height > 0 &&
        box.top >= 0 &&
        box.bottom <= window.innerHeight + 1 &&
        box.left >= 0 &&
        box.right <= window.innerWidth + 1,
      reachable: Boolean(
        top &&
          (input === top ||
            input.contains(top) ||
            top.closest('[data-testid="chat-input"]'))
      ),
    };
  });
  if (!result.found) throw new Error('The Summer composer is not rendered');
  if (!result.inViewport)
    throw new Error(
      `The Summer composer is outside the viewport${fullscreen ? ' in Full Screen' : ''}`
    );
  if (!result.reachable)
    throw new Error(
      `The Summer composer is covered${fullscreen ? ' in Full Screen' : ''}`
    );
}

async function assertMainPlaneFillsViewport(page) {
  const fits = await page.evaluate(() => {
    const plane = document.querySelector('[data-app-shell-main-plane="true"]');
    if (!plane) return { ok: false, why: 'no main plane' };
    const r = plane.getBoundingClientRect();
    return {
      ok:
        Math.abs(r.width - window.innerWidth) <= 1 &&
        Math.abs(r.height - window.innerHeight) <= 1 &&
        document.documentElement.scrollWidth <= window.innerWidth,
      why: `plane ${Math.round(r.width)}x${Math.round(r.height)} in ${window.innerWidth}x${window.innerHeight}`,
    };
  });
  if (!fits.ok) throw new Error(`Full Screen main plane: ${fits.why}`);
}

async function assertFullscreenGeometry(page) {
  const geometry = await page.evaluate(() => {
    const rect = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const frameEl = document.querySelector('[data-testid="ovie-fullscreen"]');
    const canvasEl = document.querySelector(
      '[data-testid="ovie-fullscreen-canvas"]'
    );
    const plane = document.querySelector('[data-app-shell-main-plane="true"]');
    const scale = canvasEl
      ? canvasEl.getBoundingClientRect().width /
        Math.max(1, canvasEl.offsetWidth)
      : 1;
    const truncated = [];
    for (const el of frameEl ? frameEl.querySelectorAll('*') : []) {
      const style = getComputedStyle(el);
      const clamped = style.webkitLineClamp && style.webkitLineClamp !== 'none';
      if (style.textOverflow === 'ellipsis' || clamped)
        truncated.push(
          `${el.tagName.toLowerCase()}:${(el.textContent ?? '').trim().slice(0, 40)}`
        );
    }
    const tiles = [
      ...document.querySelectorAll('[data-testid^="ovie-tile-"]'),
    ].map(el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top };
    });
    // Real content, not stretched boxes: the lowest text-bearing leaf in a column.
    const bottoms = [
      ...document.querySelectorAll('[data-testid$="-section"] *'),
    ]
      .filter(
        el =>
          el.children.length === 0 && (el.textContent ?? '').trim().length > 0
      )
      .map(el => el.getBoundingClientRect().bottom);
    const value = document.querySelector(
      '[data-testid="ovie-tile-revenue"] span.font-semibold'
    );
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      plane: rect(plane),
      frame: rect(frameEl),
      canvas: rect(canvasEl),
      tiles,
      scale,
      truncated,
      contentBottom: bottoms.length ? Math.max(...bottoms) : null,
      valuePx: value
        ? parseFloat(getComputedStyle(value).fontSize) * scale
        : null,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  const { viewport: vp, plane, frame, canvas, tiles, truncated } = geometry;
  const problems = [];
  if (!plane || Math.abs(plane.w - vp.w) > 1 || Math.abs(plane.h - vp.h) > 1)
    problems.push(
      `main plane ${JSON.stringify(plane)} is not the viewport ${vp.w}x${vp.h}`
    );
  if (geometry.overflowX) problems.push('horizontal overflow');
  if (!frame || !canvas) problems.push('HUD frame missing');
  else {
    // The scaled canvas fills its region; drift moves it at most 10 scaled px,
    // inside its 16 scaled px padding.
    const slack = Math.ceil(10 * Math.max(1, geometry.scale)) + 1;
    if (
      Math.abs(canvas.w - frame.w) > 1 ||
      Math.abs(canvas.h - frame.h) > 1 ||
      Math.abs(canvas.x - frame.x) > slack ||
      Math.abs(canvas.y - frame.y) > slack
    )
      problems.push(
        `canvas ${JSON.stringify(canvas)} does not fill its region ${JSON.stringify(frame)}`
      );
  }
  for (const tile of tiles)
    if (tile.left < -1 || tile.right > vp.w + 1)
      problems.push(
        `tile clipped: ${tile.left.toFixed(0)}..${tile.right.toFixed(0)} of ${vp.w}`
      );
  if (tiles.length === 0 && ovieFixture) problems.push('no tiles rendered');
  if (truncated.length > 0)
    problems.push(
      `ellipsis or line clamp in Full Screen: ${truncated.slice(0, 3).join(' | ')}`
    );
  if (vp.w >= 3000 && frame) {
    const top = tiles.length ? Math.min(...tiles.map(tile => tile.top)) : null;
    const span =
      top === null || geometry.contentBottom === null
        ? 0
        : (geometry.contentBottom - top) / frame.h;
    if (span < 0.7)
      problems.push(
        `content fills ${(span * 100).toFixed(0)}% of the HUD height, need 70%`
      );
    if (ovieFixture && (geometry.valuePx === null || geometry.valuePx < 48))
      problems.push(`tile value renders at ${geometry.valuePx}px, need 48px`);
  }
  if (problems.length > 0)
    throw new Error(`Full Screen geometry: ${problems.join('; ')}`);
}

async function waitForAuthenticatedShell(page, route) {
  if (!route.startsWith('/app/')) return;

  // A second dashboard-header can stay hidden in the DOM; wait until any
  // match is visible so Playwright strict mode cannot fail closed.
  const visibleShellChrome = page
    .locator(
      '[data-testid="dashboard-header"], [data-testid="dashboard-error"]'
    )
    .filter({ visible: true });
  await visibleShellChrome.first().waitFor({
    state: 'visible',
    timeout: AUTHENTICATED_SHELL_WAIT_MS,
  });
  if (
    (await page
      .getByTestId('dashboard-error')
      .filter({ visible: true })
      .count()) > 0
  ) {
    throw new Error(
      'Captured app route rendered dashboard error UI instead of authenticated shell'
    );
  }

  const shellMarker = page
    .getByRole('heading', { name: 'New Chat', level: 1 })
    .or(page.getByRole('link', { name: 'New Chat' }))
    .or(page.getByRole('link', { name: 'Inbox' }))
    .or(page.getByRole('link', { name: 'Library' }));

  await shellMarker.filter({ visible: true }).first().waitFor({
    state: 'visible',
    timeout: AUTHENTICATED_SHELL_WAIT_MS,
  });

  if (isOvieCaptureRoute(route)) await assertOvieHome(page, route);

  if (route === '/app/chat' || route.startsWith('/app/chat/')) {
    // JOV-7150: the loaded empty state is one greeting sentence rendered as
    // chat-empty-state-greeting-text. The loading still-frame only renders an
    // aria-hidden skeleton inside chat-empty-state-greeting-region, so the
    // -text testid is unique to the loaded state.
    await page
      .getByRole('heading', { level: 2 })
      .and(page.getByTestId('chat-empty-state-greeting-text'))
      .filter({ visible: true })
      .first()
      .waitFor({
        state: 'visible',
        timeout: NEW_CHAT_EMPTY_WAIT_MS,
      });
  }
}

function sanitizeRuntimeFailures(failures) {
  return failures.map(failure => ({
    ...failure,
    ...(failure.message
      ? { message: sanitizeCaptureText(failure.message) }
      : {}),
    ...(failure.url
      ? {
          url: (() => {
            try {
              const parsed = new URL(failure.url);
              return `${parsed.origin}${parsed.pathname}`;
            } catch {
              return '[invalid-url]';
            }
          })(),
        }
      : {}),
  }));
}

await mkdir(outDir, { recursive: true });
const workers = resolveCaptureWorkerCount(process.env.PR_VISUAL_WORKERS);
// Populated Ovie Home data (no database in this lane). Timestamps in the
// fixture are 2000-01-01THH:MM:SS.000Z and become now + that offset per request.
const ovieFixture = (() => {
  try {
    return JSON.parse(
      readFileSync(join(outDir, 'ovie-home-fixture.json'), 'utf8')
    );
  } catch {
    return null;
  }
})();
const stampFixture = value =>
  JSON.stringify(value).replace(
    /2000-01-01T(\d\d):(\d\d):(\d\d)\.000Z/g,
    (_match, hh, mm, ss) =>
      new Date(
        Date.now() + (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000
      ).toISOString()
  );
const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const targets = routes.flatMap(route =>
  captureViewportNamesForRoute(route).map(viewportName => ({
    route,
    viewportName,
    viewport: viewports[viewportName],
  }))
);
let failureCount = 0;
let captures;
try {
  captures = await runCapturePool(targets, workers, async (target, index) => {
    const { route, viewportName, viewport } = target;
    const sessionId = `context-${String(index + 1).padStart(2, '0')}`;
    const { artifactPath, outputPath } = buildCaptureArtifactPaths({
      outDir,
      route,
      viewportName,
    });
    const tracePath = artifactPath.replace(/\.png$/, '.trace.zip');
    const journeyId = resolveCaptureJourneyId(route);
    const actions = [];
    const runtimeFailures = [];
    const observed = {
      finalUrl: '',
      title: '',
      statusCode: null,
      text: '',
      runtimeFailures,
    };
    const result = {
      route,
      journeyId,
      viewport: viewportName,
      path: artifactPath,
      status: 'blocked',
      lane: 'scripted',
      sessionId,
      assertion: {
        id: `route-render:${journeyId ?? artifactPath.replace(/\.png$/, '')}`,
        preserved: true,
        expectedOutcome:
          'Requested route renders its intended state without a redirect, error shell, or blocking runtime failure.',
      },
      actions,
      observed,
      evidence: { screenshot: artifactPath, trace: null },
    };

    if (failureCount >= CIRCUIT_BREAKER_FAILURES) {
      result.error = `Circuit breaker opened after ${failureCount} scripted capture failures.`;
      return result;
    }

    let context = null;
    let page = null;
    let tracingStarted = false;
    let failureRecorded = false;
    try {
      context = await browser.newContext({
        viewport,
        colorScheme: 'dark',
        deviceScaleFactor: 1,
      });
      actions.push('create-isolated-browser-context');
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: false,
      });
      tracingStarted = true;
      if (isOvieCaptureRoute(route) && ovieFixture)
        await context.route('**/api/**', async intercepted => {
          const path = new URL(intercepted.request().url()).pathname;
          if (
            route.includes('capture=chat') &&
            path === '/api/chat' &&
            intercepted.request().method() === 'POST'
          )
            return intercepted.fulfill({
              status: 200,
              headers: {
                'content-type': 'text/event-stream',
                'cache-control': 'no-store',
                'x-vercel-ai-ui-message-stream': 'v1',
              },
              body: OVIE_CHAT_STREAM,
            });
          const payload = ovieFixture[path];
          if (payload === undefined || intercepted.request().method() !== 'GET')
            return intercepted.continue();
          return intercepted.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'cache-control': 'no-store' },
            body: stampFixture(payload),
          });
        });
      page = await context.newPage();
      page.on('console', message => {
        if (message.type() === 'error')
          runtimeFailures.push({
            type: 'console-error',
            message: message.text(),
          });
      });
      page.on('pageerror', error =>
        runtimeFailures.push({ type: 'page-error', message: error.message })
      );
      page.on('response', response => {
        if (response.status() >= 500)
          runtimeFailures.push({
            type: 'http-5xx',
            status: response.status(),
            url: response.url(),
          });
      });
      const url = new URL(route, baseUrl).toString();
      if (route.startsWith('/app/')) {
        actions.push(`bootstrap-${capturePersonaForRoute(route)}-session`);
        const authEntryUrl = new URL(
          `/api/dev/test-auth/enter?persona=${capturePersonaForRoute(route)}&redirect=${encodeURIComponent(route)}`,
          baseUrl
        );
        const authResponse = await context.request.get(
          authEntryUrl.toString(),
          { maxRedirects: 0, timeout: CAPTURE_TIMEOUT_MS }
        );
        if (authResponse.status() !== 303)
          throw new Error(
            `Test-auth returned HTTP ${authResponse.status()}; expected HTTP 303.`
          );
        const location = authResponse.headers().location;
        if (!location)
          throw new Error('Test-auth 303 did not include a redirect location.');
        const destination = new URL(location, baseUrl);
        const expected = new URL(url);
        if (destination.origin !== expected.origin)
          throw new Error('Test-auth redirected outside capture origin.');
        if (destination.pathname !== expected.pathname)
          throw new Error(
            `Test-auth redirect target ${destination.pathname} did not match requested route ${expected.pathname}.`
          );
      }
      actions.push(`navigate:${route}`);
      const response = await page.goto(url, {
        waitUntil: route.startsWith('/app/')
          ? 'domcontentloaded'
          : 'networkidle',
        timeout: CAPTURE_TIMEOUT_MS,
      });
      observed.statusCode = response?.status() ?? null;
      if (!response || !response.ok())
        throw new Error(`HTTP ${response?.status() ?? 'unknown'}`);
      observed.finalUrl = page.url();
      observed.title = await page.title();
      if (route.startsWith('/app/')) {
        const expected = new URL(url);
        const final = new URL(observed.finalUrl);
        if (
          final.origin !== expected.origin ||
          final.pathname !== expected.pathname
        )
          throw new Error(
            `Test-auth handoff ended at ${observed.finalUrl}, expected ${expected.toString()}.`
          );
      }
      await waitForAuthenticatedShell(page, route);
      const pageText = (await page.locator('body').innerText()).trim();
      observed.text = sanitizeCaptureText(pageText);
      actions.push('assert-original-route-outcome');
      if (!pageText || /\b404\b|content not found/i.test(pageText))
        throw new Error('Captured route did not render a meaningful surface');
      if (route.startsWith('/app/') && !/Inbox|Library|New Chat/.test(pageText))
        throw new Error(
          'Captured app route did not render authenticated shell'
        );
      if (
        route.startsWith('/app/') &&
        /Welcome back|Continue with Google/.test(pageText)
      )
        throw new Error('Captured app route rendered sign-in shell');
      const blockingFailures = blockingCaptureRuntimeFailures(runtimeFailures, {
        route,
        baseUrl,
      });
      if (blockingFailures.length > 0)
        throw new Error(
          `Captured route emitted runtime failures: ${JSON.stringify(sanitizeRuntimeFailures(blockingFailures))}`
        );
      actions.push('capture-screenshot');
      await page.screenshot({ path: outputPath, fullPage: true });
      result.status = 'captured';
    } catch (error) {
      result.status = 'failed';
      result.error = sanitizeCaptureText(error?.message ?? error);
      failureCount += 1;
      failureRecorded = true;
      console.error(`Capture failed ${route} ${viewportName}: ${result.error}`);
      await page
        ?.screenshot({ path: outputPath, fullPage: true })
        .catch(() => undefined);
    } finally {
      observed.finalUrl ||= page?.url() ?? '';
      observed.title ||= (await page?.title().catch(() => '')) ?? '';
      observed.runtimeFailures = sanitizeRuntimeFailures(runtimeFailures);
      if (context && tracingStarted) {
        try {
          await context.tracing.stop({ path: join(outDir, tracePath) });
          result.evidence.trace = tracePath;
        } catch (error) {
          result.status = 'failed';
          result.error = `Trace capture failed: ${sanitizeCaptureText(error?.message ?? error)}`;
        }
      }
      try {
        await context?.close();
      } catch (error) {
        result.status = 'failed';
        result.error = `Browser context cleanup failed: ${sanitizeCaptureText(error?.message ?? error)}`;
      }
      if (result.status === 'failed' && !failureRecorded) failureCount += 1;
    }
    return result;
  });
} finally {
  await browser.close();
}
const summary = summarizeScriptedCaptures(captures);
const evidenceManifest = {
  schema: CRITICAL_JOURNEY_CAPTURE_SCHEMA,
  sourceSha: exactHead,
  scope: {
    kind: 'risk-selected-subset',
    fullInventoryCoverage: false,
  },
  artifact: {
    kind: 'exact-source-head-local-production-build',
    revision: exactHead,
    baseUrl,
  },
  configuration: {
    authMode: 'secretless-synthetic',
    retries: 0,
    timeoutMs: CAPTURE_TIMEOUT_MS,
    stepLimit: 6,
    spendLimitUsd: 0,
    circuitBreakerFailures: CIRCUIT_BREAKER_FAILURES,
  },
  fixture: {
    revision: exactHead,
    mutable: false,
    isolation: 'per-browser-context',
  },
  browser: { name: 'chromium', version: browserVersion, viewports },
  workerCeiling: MAX_CAPTURE_WORKERS,
  workers,
  summary,
  exploratory: { status: 'not-run', findings: [] },
  semanticReview: { status: 'not-run', observations: [] },
  routes,
  viewports,
  captures,
};
await writeFile(
  join(outDir, 'manifest.json'),
  JSON.stringify(evidenceManifest, null, 2)
);
const validation = validateCaptureManifest(evidenceManifest, {
  routes,
  viewportNamesForRoute: captureViewportNamesForRoute,
});
const validationFailures = [...validation.failures];
try {
  const routing = JSON.parse(
    readFileSync(join(outDir, 'routing.json'), 'utf8')
  );
  validationFailures.push(...validateRoutesMatchChange(routing.files, routes));
} catch {
  // No routing receipt (local run): the route/file guard cannot run.
}
if (validationFailures.length > 0) {
  await writeFile(
    join(outDir, 'capture-validation.json'),
    JSON.stringify({ ok: false, failures: validationFailures }, null, 2)
  );
  console.error('Visual capture validation failed:');
  for (const failure of validationFailures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}

/**
 * The unprivileged pull_request workflow (read-only token, no secrets) runs
 * this checked-out script from the exact PR head. Keep the
 * public footer interaction proof here so it shares this job's exact build and
 * production server rather than creating a second browser lane.
 */
async function runFooterInteractionProof() {
  if (!routes.includes('/')) return;
  // The footer theme control ships only when theme switching is enabled at
  // build time (#18820 forces dark by default); the Playwright dev-server
  // suite keeps covering it with the flag on.
  if (!isThemeSwitchingBuild(process.env)) return;

  const child = spawn(
    'pnpm',
    [
      '--filter',
      '@jovie/web',
      'exec',
      'playwright',
      'test',
      'tests/e2e/marketing-footer-controls.spec.ts',
      '--config=playwright.config.ts',
      '--project=chromium',
      '--reporter=line',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        E2E_SKIP_WEB_SERVER: '1',
        E2E_SKIP_SEED: '1',
        E2E_SKIP_WARMUP: '1',
        PR_VISUAL_OUT: outDir,
        PR_VISUAL_HEAD_SHA: exactHead ?? '',
      },
      stdio: 'inherit',
    }
  );

  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  if (result.code === 0) return;

  const failure = {
    route: '/',
    exactHead,
    code: result.code,
    signal: result.signal,
    status: 'failed',
  };
  await writeFile(
    join(outDir, 'footer-interaction-failure.json'),
    JSON.stringify(failure, null, 2)
  );
  throw new Error(
    `Footer interaction proof failed (code=${result.code ?? 'null'}, signal=${result.signal ?? 'null'})`
  );
}

await runFooterInteractionProof();

function isThemeSwitchingBuild(env) {
  const flag = env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING;
  return flag === '1' || flag === 'true';
}
