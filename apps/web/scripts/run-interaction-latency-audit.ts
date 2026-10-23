/**
 * Measure every declared interaction hot path and write a compact receipt.
 *
 * The page is a Playwright Chromium harness that implements each scenario's
 * declared selectors and interaction class. It is not the authenticated Jovie
 * app shell. Budgets in the manifest are scored as written.
 *
 *   pnpm --filter @jovie/web exec tsx scripts/run-interaction-latency-audit.ts
 *   pnpm --filter @jovie/web exec tsx scripts/run-interaction-latency-audit.ts --check
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, platform, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

import { measureInteractionLatency } from '../tests/e2e/utils/interaction-latency-utils';
import { getInteractionHotPathManifest } from './performance-interaction-manifest';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
  percentile,
} from './performance-interaction-report';

const WARMUP_RUNS = 2;
const SCORED_RUNS = 20;
const VIEWPORT = { width: 1440, height: 900 };
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const playwrightVersion = createRequire(import.meta.url)(
  '@playwright/test/package.json'
).version as string;

interface Harness {
  reset: () => void;
  startFrames: () => void;
  dropped: () => number;
  renderToInteractiveMs: number | null;
}

function harnessHtml(scenarioId: string) {
  return `<!doctype html><meta charset="utf-8"><title>${scenarioId}</title><body><div id="app"></div><script>
(() => {
const scenarioId = ${JSON.stringify(scenarioId)};
const app = document.getElementById('app');
let dropped = 0;
let lastFrame = 0;
let armed = false;
let raf = 0;
function frames(now) {
  if (armed && lastFrame && now - lastFrame > 34) dropped += 1;
  lastFrame = now;
  raf = requestAnimationFrame(frames);
}
function el(tag, attrs, text) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) node.setAttribute(key, value);
  }
  if (text) node.textContent = text;
  return node;
}
function markRender() {
  const started = performance.now();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      harness.renderToInteractiveMs = performance.now() - started;
    });
  });
}
function paint(phase) {
  app.replaceChildren();
  const acted = phase === 'acted';
  if (scenarioId === 'command-palette-open') {
    if (!acted) return;
    const palette = el('div', { 'data-testid': 'shared-command-palette', role: 'dialog' });
    palette.append(el('input', { 'aria-label': 'Command palette search' }));
    app.append(palette);
    return;
  }
  if (scenarioId === 'command-palette-filter') {
    const input = el('input', { 'aria-label': 'Command palette search' });
    app.append(input);
    input.focus();
    if (acted) app.append(el('div', { 'cmdk-item': '' }, 'Home'));
    return;
  }
  if (scenarioId === 'slash-picker-open') {
    const input = el('textarea', { 'aria-label': 'Chat Message Input' });
    app.append(input);
    input.focus();
    if (acted) app.append(el('div', { 'data-testid': 'slash-command-menu', role: 'listbox' }, 'Skill'));
    return;
  }
  if (scenarioId === 'release-table-row-move') {
    const row = el('div', { role: 'row', tabindex: '0' }, 'Release');
    if (acted) row.setAttribute('aria-selected', 'true');
    app.append(row);
    row.focus();
    return;
  }
  if (scenarioId === 'release-drawer-open') {
    const row = el('div', { role: 'row', tabindex: '0', 'aria-selected': 'true' }, 'Release');
    app.append(row);
    row.focus();
    if (!acted) return;
    const drawer = el('div', { 'data-testid': 'release-sidebar', role: 'dialog' }, 'Drawer');
    app.append(drawer);
    return;
  }
  if (scenarioId === 'chat-route-cached-switch') {
    if (!acted) return;
    const main = el('main', { 'data-testid': 'app-shell-scroll' });
    main.append(el('textarea', { 'aria-label': 'Chat Message Input' }));
    app.append(main);
    return;
  }
  if (scenarioId === 'chat-message-round-trip') {
    const input = el('textarea', { 'aria-label': 'Chat Message Input' });
    app.append(input);
    input.focus();
    if (!acted) return;
    app.append(el('div', { 'data-testid': 'chat-user-bubble' }, 'Hello'));
    app.append(el('div', { 'data-testid': 'chat-message-reply' }, 'Reply'));
    markRender();
    return;
  }
  if (scenarioId === 'metadata-save-feedback') {
    const button = el('button', { id: 'save', type: 'button' }, 'Save');
    if (acted) {
      button.setAttribute('aria-busy', 'true');
      button.setAttribute('data-save-state', 'pending');
      button.setAttribute('data-pending', 'true');
    }
    app.append(button);
    button.focus();
    return;
  }
  if (scenarioId === 'lyrics-toggle') {
    if (acted) app.append(el('section', { 'aria-label': 'Lyrics', tabindex: '0' }, 'Line'));
    return;
  }
  if (scenarioId === 'audio-play-pause-visual') {
    app.append(el('button', { type: 'button', 'aria-label': acted ? 'Pause' : 'Transport' }, acted ? 'Pause' : 'Transport'));
    return;
  }
  throw new Error('No harness for ' + scenarioId);
}
const harness = {
  renderToInteractiveMs: null,
  reset() { this.renderToInteractiveMs = null; armed = false; paint('idle'); },
  startFrames() {
    dropped = 0;
    lastFrame = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frames);
  },
  dropped() { return dropped; },
  act() {
    armed = true;
    paint('acted');
    requestAnimationFrame(() => { armed = false; });
  },
};
document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  const open = (event.metaKey || event.ctrlKey) && key === 'k';
  const route = event.altKey && key === 'c';
  const slash = event.key === '/';
  const row = event.key === 'ArrowDown';
  const enter = event.key === 'Enter';
  const lyrics = key === 'l' && !event.metaKey && !event.ctrlKey && !event.altKey;
  const audio = event.code === 'Space';
  const filter = scenarioId === 'command-palette-filter' && key === 'h';
  const send = scenarioId === 'chat-message-round-trip' && enter;
  const save = scenarioId === 'metadata-save-feedback' && enter;
  const drawer = scenarioId === 'release-drawer-open' && enter;
  if (scenarioId === 'command-palette-open' && open) { event.preventDefault(); harness.act(); }
  if (filter) harness.act();
  if (scenarioId === 'slash-picker-open' && slash) { event.preventDefault(); harness.act(); }
  if (scenarioId === 'release-table-row-move' && row) { event.preventDefault(); harness.act(); }
  if (drawer) { event.preventDefault(); harness.act(); }
  if (scenarioId === 'chat-route-cached-switch' && route) { event.preventDefault(); harness.act(); }
  if (send) { event.preventDefault(); harness.act(); }
  if (save) { event.preventDefault(); harness.act(); }
  if (scenarioId === 'lyrics-toggle' && lyrics) { event.preventDefault(); harness.act(); }
  if (scenarioId === 'audio-play-pause-visual' && audio) { event.preventDefault(); harness.act(); }
});
window.__jovieHarness = harness;
harness.reset();
})();
</script></body>`;
}

async function readHarness(page: Page) {
  return page.evaluate(() => {
    const harness = (window as Window & { __jovieHarness: Harness })
      .__jovieHarness;
    return {
      droppedFrameCount: harness.dropped(),
      renderToInteractiveMs: harness.renderToInteractiveMs,
    };
  });
}

async function prepare(page: Page) {
  await page.evaluate(() => {
    (window as Window & { __jovieHarness: Harness }).__jovieHarness.reset();
  });
  await page.evaluate(
    () =>
      new Promise<void>(resolvePaint => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolvePaint())
        );
      })
  );
  await page.evaluate(() => {
    (
      window as Window & { __jovieHarness: Harness }
    ).__jovieHarness.startFrames();
  });
}

const actions: Record<string, (page: Page) => Promise<void>> = {
  'command-palette-open': page => page.keyboard.press('Control+k'),
  'command-palette-filter': page => page.keyboard.press('h'),
  'slash-picker-open': page => page.keyboard.press('/'),
  'release-table-row-move': page => page.keyboard.press('ArrowDown'),
  'release-drawer-open': page => page.keyboard.press('Enter'),
  'chat-route-cached-switch': page => page.keyboard.press('Alt+c'),
  'chat-message-round-trip': page => page.keyboard.press('Enter'),
  'metadata-save-feedback': page => page.keyboard.press('Enter'),
  'lyrics-toggle': page => page.keyboard.press('l'),
  'audio-play-pause-visual': page => page.keyboard.press('Space'),
};

function roundMs(value: number) {
  return Math.round(value * 1000) / 1000;
}

function deviceInfo() {
  let pretty = `${platform()} ${release()}`;
  try {
    const osRelease = readFileSync('/etc/os-release', 'utf8');
    pretty = osRelease.match(/^PRETTY_NAME="(.*)"$/m)?.[1] ?? pretty;
  } catch {
    // Hosts without os-release keep the platform string.
  }
  const cpu = cpus()[0];
  return {
    os: pretty,
    kernel: release(),
    arch: process.arch,
    cpuModel: cpu?.model ?? 'unknown',
    cpuCount: cpus().length,
  };
}

function receiptDate(generatedAt: string) {
  return generatedAt.slice(0, 10);
}

function renderMarkdown(receipt: {
  date: string;
  measurementSurface: string;
  device: ReturnType<typeof deviceInfo>;
  browser: string;
  viewport: string;
  warmupRuns: number;
  runsPerScenario: number;
  scenarios: readonly {
    id: string;
    interactionClass: string;
    medianFirstFeedbackMs: number;
    p95FirstFeedbackMs: number;
    medianUsableStateMs: number | null;
    p95UsableStateMs: number | null;
    p95RenderToInteractiveMs: number | null;
    maxDroppedFrameCount: number | null;
    targetLabel: string;
    passed: boolean;
  }[];
}) {
  const ms = (value: number | null) =>
    value === null ? 'n/a' : `${value.toFixed(1)}ms`;
  const rows = receipt.scenarios.map(
    scenario =>
      `| ${[
        scenario.id,
        scenario.interactionClass,
        ms(scenario.medianFirstFeedbackMs),
        ms(scenario.p95FirstFeedbackMs),
        ms(scenario.medianUsableStateMs),
        ms(scenario.p95UsableStateMs),
        scenario.p95RenderToInteractiveMs === null
          ? 'n/a'
          : ms(scenario.p95RenderToInteractiveMs),
        scenario.maxDroppedFrameCount === null
          ? 'n/a'
          : String(scenario.maxDroppedFrameCount),
        scenario.targetLabel,
        scenario.passed ? 'pass' : 'fail',
      ].join(' | ')} |`
  );
  return [
    `# Interaction latency receipt (${receipt.date})`,
    '',
    receipt.measurementSurface,
    '',
    'Budgets were not changed. Median is nearest-rank p50 (`ceil(p/100*n)-1`).',
    `Machine-readable receipt: docs/performance/generated/interaction-latency-${receipt.date}.json`,
    'measureInteractionLatency records first feedback after two animation frames and usable state after another paint. On this 60Hz run that is about 64ms and 97ms. Budgets that require 50ms fail on that floor.',
    '',
    `- Device: ${receipt.device.os}; kernel ${receipt.device.kernel}; ${receipt.device.arch}`,
    `- CPU: ${receipt.device.cpuCount} x ${receipt.device.cpuModel}`,
    `- Browser: ${receipt.browser}`,
    `- Viewport: ${receipt.viewport}`,
    `- Runs: ${receipt.warmupRuns} warmup (unscored) + ${receipt.runsPerScenario} scored per scenario`,
    '',
    '| Scenario | Class | Median first feedback | p95 first feedback | Median usable | p95 usable | p95 render to interactive | Max dropped frames | Target | Result |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

async function measureAll() {
  const scenarios = getInteractionHotPathManifest();
  const missing = scenarios.filter(scenario => !actions[scenario.id]);
  if (missing.length > 0) {
    throw new Error(
      `No harness action for ${missing.map(scenario => scenario.id).join(', ')}`
    );
  }
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const samples: InteractionLatencySample[] = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    for (const scenario of scenarios) {
      await page.goto('about:blank');
      const selector = scenario.selectors.firstFeedback;
      const usable = scenario.selectors.usableState;
      if (!selector)
        throw new Error(`${scenario.id} has no firstFeedback selector`);
      await page.setContent(harnessHtml(scenario.id));
      for (let run = 0; run < WARMUP_RUNS + SCORED_RUNS; run += 1) {
        await prepare(page);
        const sample = await measureInteractionLatency(page, {
          action: () => actions[scenario.id]!(page),
          firstFeedback: () =>
            page
              .locator(selector)
              .first()
              .waitFor({ state: 'visible', timeout: 2000 }),
          usableState: usable
            ? () =>
                page
                  .locator(usable)
                  .first()
                  .waitFor({ state: 'visible', timeout: 2000 })
            : undefined,
          runIndex: run,
          scenarioId: scenario.id,
        });
        if (run < WARMUP_RUNS) continue;
        await page.evaluate(
          () =>
            new Promise<void>(resolvePaint => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolvePaint())
              );
            })
        );
        const extra = await readHarness(page);
        if (
          scenario.id === 'chat-message-round-trip' &&
          (extra.renderToInteractiveMs === null ||
            extra.renderToInteractiveMs < 0)
        ) {
          throw new Error('chat render-to-interactive was not recorded');
        }
        const scored: InteractionLatencySample = {
          ...sample,
          firstFeedbackMs: roundMs(sample.firstFeedbackMs),
          nextPaintMs:
            sample.nextPaintMs === undefined
              ? undefined
              : roundMs(sample.nextPaintMs),
          usableStateMs:
            sample.usableStateMs === undefined
              ? undefined
              : roundMs(sample.usableStateMs),
          runIndex: run - WARMUP_RUNS,
          droppedFrameCount: extra.droppedFrameCount,
          renderToInteractiveMs:
            scenario.id === 'chat-message-round-trip'
              ? roundMs(extra.renderToInteractiveMs ?? 0)
              : undefined,
        };
        samples.push(scored);
      }
    }
    await context.close();
    return { browserVersion: browser.version(), samples };
  } finally {
    await browser.close();
  }
}

function buildReceipt(
  generatedAt: string,
  browserVersion: string,
  samples: readonly InteractionLatencySample[]
) {
  const scenarios = getInteractionHotPathManifest();
  const report = buildInteractionLatencyReport({
    generatedAt,
    samples,
    scenarios,
    metadata: {
      browser: `Chromium ${browserVersion} (Playwright ${playwrightVersion})`,
      buildMode: 'test',
      cpuProfile: `${cpus().length} x ${cpus()[0]?.model ?? 'unknown'}`,
      sampleCount: SCORED_RUNS,
      viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
      networkProfile: 'local selector harness, no network',
      authPersona: 'none',
    },
  });
  const byId = new Map(
    report.summaries.map(summary => [summary.scenario.id, summary])
  );
  const rows = scenarios.map(scenario => {
    const summary = byId.get(scenario.id);
    if (!summary) throw new Error(`Missing summary for ${scenario.id}`);
    const scenarioSamples = samples.filter(
      sample => sample.scenarioId === scenario.id
    );
    const usable = scenarioSamples
      .map(sample => sample.usableStateMs)
      .filter((value): value is number => typeof value === 'number');
    return {
      id: scenario.id,
      title: scenario.title,
      interactionClass: scenario.interactionClass,
      runs: summary.sampleCount,
      medianFirstFeedbackMs: summary.p50FirstFeedbackMs,
      p95FirstFeedbackMs: summary.p95FirstFeedbackMs,
      medianUsableStateMs: percentile(usable, 50),
      p95UsableStateMs: summary.p95UsableStateMs,
      p95RenderToInteractiveMs: summary.p95RenderToInteractiveMs,
      maxDroppedFrameCount: summary.maxDroppedFrameCount,
      firstFeedbackP50BudgetMs: scenario.budget.firstFeedbackP50Ms ?? null,
      firstFeedbackP95BudgetMs: scenario.budget.firstFeedbackP95Ms,
      usableStateP95BudgetMs: scenario.budget.usableStateP95Ms ?? null,
      renderToInteractiveP95BudgetMs:
        scenario.budget.renderToInteractiveP95Ms ?? null,
      maxDroppedFramesBudget: scenario.budget.maxDroppedFrames ?? null,
      targetLabel: scenario.budget.targetLabel,
      passed: summary.passed,
      firstFeedbackMs: scenarioSamples.map(sample => sample.firstFeedbackMs),
    };
  });
  const harnessStatus = rows.every(row => row.passed === true)
    ? 'pass'
    : 'fail';
  return {
    schemaVersion: 1,
    generatedAt,
    date: receiptDate(generatedAt),
    budgetsChanged: false,
    productShellMeasured: false,
    measurementSurface:
      'Playwright Chromium harness using the declared manifest selectors and measureInteractionLatency. The authenticated Jovie app shell was not measured. Pass/fail is the harness against the unchanged budgets.',
    warmupRuns: WARMUP_RUNS,
    runsPerScenario: SCORED_RUNS,
    percentileMethod: 'nearest-rank (ceil(p/100*n)-1); median is p50',
    device: deviceInfo(),
    browser: `Chromium ${browserVersion} (Playwright ${playwrightVersion})`,
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    status: harnessStatus,
    manifestStatus: report.status,
    scenarios: rows,
  };
}

async function main() {
  const check = process.argv.includes('--check');
  const generatedAt = new Date().toISOString();
  const measured = await measureAll();
  const receipt = buildReceipt(
    generatedAt,
    measured.browserVersion,
    measured.samples
  );
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  const markdown = renderMarkdown(receipt);
  const stem = `interaction-latency-${receipt.date}`;
  const jsonDirectory = check
    ? resolve(scriptDir, '../test-results/interaction-latency-receipt')
    : resolve(repoRoot, 'docs/performance/generated');
  const markdownDirectory = check
    ? jsonDirectory
    : resolve(repoRoot, 'docs/performance/receipts');
  mkdirSync(jsonDirectory, { recursive: true });
  mkdirSync(markdownDirectory, { recursive: true });
  writeFileSync(resolve(jsonDirectory, `${stem}.json`), json);
  writeFileSync(resolve(markdownDirectory, `${stem}.md`), markdown);
  console.log(`${receipt.status} ${jsonDirectory}/${stem}.json`);
  for (const scenario of receipt.scenarios) {
    console.log(
      `${scenario.passed ? 'pass' : 'fail'}\t${scenario.id}\tmedian ${scenario.medianFirstFeedbackMs}ms\tp95 ${scenario.p95FirstFeedbackMs}ms`
    );
  }
  if (receipt.status !== 'pass') process.exitCode = 1;
}

const isDirectRun = process.argv[1]?.includes('run-interaction-latency-audit');
if (isDirectRun) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
