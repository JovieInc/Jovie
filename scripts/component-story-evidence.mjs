#!/usr/bin/env node
/**
 * Story-capture producer for the component certificate's `visual` and `a11y`
 * criteria. Captures the stories of every certified component (packages/ui
 * and apps/web) from a running Storybook in light and dark and writes
 * `jovie.component-story-evidence/v1` receipts bound to each component's own
 * render closure (`jovie.component-render-inputs/v2`), so a later run reuses
 * every receipt whose inputs did not change:
 *
 *   node scripts/component-story-evidence.mjs --base-url http://localhost:6006 \
 *     --out-dir /tmp/story-evidence [--index index.json] [--reuse-dir prior] \
 *     [--shard 1/2] [--component packages/ui/atoms/button.tsx] [--local]
 *   node scripts/component-story-evidence.mjs --index index.json --reuse-dir prior --plan 20
 *       (no browser: prints {shards, matrix, capture, reused, renders} as JSON)
 *   node scripts/component-story-evidence.mjs --list        (selection only, no browser)
 *   node scripts/component-story-evidence.mjs --merge --reuse-dir prior \
 *     --out-dir all [--expect N] shard-1 shard-2
 *
 * Per story × theme it fails on: no render, a Storybook render/play error,
 * any page error or console error, the preview not applying the theme, or any
 * WCAG 2.2 AA axe violation (a11y). It records a sha256 of a viewport
 * screenshot (visual); there are no pixel baselines yet, so nothing is
 * compared. Storybook never runs on gem: see runnerRefusal().
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  COVERAGE_ROOTS,
  listComponentsInRoot,
  REPO_ROOT,
} from './component-ship-policy.mjs';
import { componentRenderBindings } from './lib/component-render-closure.mjs';
import { storybookProfile } from './lib/component-render-inputs.mjs';
import {
  assembleEvidence,
  mergeEvidence,
  parseShard,
  reusableReceipts,
  runnerRefusal,
  STORY_THEMES,
  selectStories,
  shardComponents,
  shardCount,
  storyUrl,
  summarizeEvidence,
  THEME_STORAGE_KEY,
} from './lib/component-story-evidence-lib.mjs';

// Same list as apps/web/lib/a11y-gates/wcag-22-aa.ts (the Storybook gate).
const WCAG_22_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
];
// Storybook's own chrome in the preview iframe; never part of a story.
const STORYBOOK_CHROME = [
  '#storybook-docs',
  '.sb-errordisplay',
  '.sb-nopreview',
  '.sb-preparing-story',
  '.sb-preparing-docs',
];
const MAX_ERRORS = 5;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'base-url': { type: 'string', default: 'http://localhost:6006' },
    'out-dir': { type: 'string', default: 'component-story-evidence' },
    'repo-root': { type: 'string', default: REPO_ROOT },
    'storybook-cwd': { type: 'string', default: 'apps/web' },
    component: { type: 'string', multiple: true },
    shard: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    'timeout-ms': { type: 'string', default: '45000' },
    local: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    merge: { type: 'boolean', default: false },
    index: { type: 'string' },
    'reuse-dir': { type: 'string' },
    plan: { type: 'string' },
    expect: { type: 'string' },
  },
});

const root = resolve(values['repo-root']);
const outDir = resolve(values['out-dir']);
const log = message => console.error(`[story-evidence] ${message}`);
const writeJson = (path, data) =>
  writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`);

function writeEvidence(evidence) {
  mkdirSync(outDir, { recursive: true });
  writeJson(join(outDir, 'visual.json'), evidence.visual);
  writeJson(join(outDir, 'a11y.json'), evidence.a11y);
  const lines = summarizeEvidence(evidence);
  for (const line of lines) console.log(line);
  const failed = Object.keys(evidence.visual.components).filter(
    path =>
      evidence.visual.components[path].status === 'fail' ||
      evidence.a11y.components[path]?.status === 'fail'
  ).length;
  console.log(
    `components ${lines.length}, failing ${failed}; wrote ${join(outDir, 'visual.json')} and a11y.json`
  );
}

const readJsonIn = (dir, name) => {
  const path = join(resolve(dir), name);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
};
const prior = values['reuse-dir']
  ? {
      visual: readJsonIn(values['reuse-dir'], 'visual.json')?.components ?? {},
      a11y: readJsonIn(values['reuse-dir'], 'a11y.json')?.components ?? {},
    }
  : { visual: {}, a11y: {} };

const componentPaths = new Set();
for (const coverageRoot of COVERAGE_ROOTS)
  for (const c of listComponentsInRoot(coverageRoot, root))
    componentPaths.add(c.sourceRel);

/** Current source hash and v2 closure binding for each component path. */
function currentInputs(paths) {
  const { bindings, problem, stats } = componentRenderBindings(
    root,
    componentPaths,
    storybookProfile(process.env)
  );
  if (problem) throw new Error(`render inputs unavailable: ${problem}`);
  if (stats.global)
    log(`${stats.global} components fall back to the global digest`);
  const inputs = new Map();
  for (const path of paths)
    inputs.set(path, {
      renderInputs: bindings.get(path),
      sourceHash: createHash('sha256')
        .update(readFileSync(join(root, path)))
        .digest('hex'),
    });
  return inputs;
}

if (values.merge) {
  if (!positionals.length && !values['reuse-dir'])
    throw new Error('--merge needs shard directories or --reuse-dir');
  const shards = positionals.map(dir => ({
    visual: readJsonIn(dir, 'visual.json'),
    a11y: readJsonIn(dir, 'a11y.json'),
  }));
  const missing = positionals.filter(
    (_, i) => !shards[i].visual || !shards[i].a11y
  );
  if (missing.length)
    throw new Error(`shard evidence missing in ${missing.join(', ')}`);
  const visual = mergeEvidence(shards.map(s => s.visual));
  const a11y = mergeEvidence(shards.map(s => s.a11y));
  const captured = Object.keys(visual.components).length;
  if (values.expect !== undefined && captured !== Number(values.expect))
    throw new Error(
      `shards captured ${captured} components, plan expected ${values.expect}`
    );
  // Carry forward every prior receipt the current tree still matches.
  const carried = [...componentPaths].filter(
    path => !visual.components[path] && prior.visual[path]
  );
  const reuse = reusableReceipts(prior, currentInputs(carried));
  for (const [path, receipts] of reuse) {
    visual.components[path] = receipts.visual;
    a11y.components[path] = receipts.a11y;
  }
  const sorted = file => ({
    components: Object.fromEntries(
      Object.entries(file.components).sort(([a], [b]) => a.localeCompare(b))
    ),
  });
  log(`merged ${captured} captured and ${reuse.size} reused components`);
  writeEvidence({ visual: sorted(visual), a11y: sorted(a11y) });
  process.exit(0);
}

const refusal =
  values.list || values.plan
    ? null
    : runnerRefusal(process.env, { local: values.local });
if (refusal) {
  log(refusal);
  process.exit(2);
}

const baseUrl = values['base-url'].replace(/\/+$/, '');
let index;
if (values.index)
  index = JSON.parse(readFileSync(resolve(values.index), 'utf8'));
else {
  const indexResponse = await fetch(`${baseUrl}/index.json`);
  if (!indexResponse.ok)
    throw new Error(
      `${baseUrl}/index.json answered HTTP ${indexResponse.status}`
    );
  index = await indexResponse.json();
}

const selection = selectStories(index, componentPaths, values['storybook-cwd']);
if (selection.unmapped.length)
  log(
    `${selection.unmapped.length} story files cover no certified component (e.g. ${selection.unmapped[0]}); not evidence`
  );
let selected = selection.components;
if (values.component?.length) {
  const wanted = new Set(values.component);
  selected = new Map([...selected].filter(([path]) => wanted.has(path)));
  for (const path of wanted)
    if (!selected.has(path))
      log(`${path} has no stories in the Storybook index`);
}

const inputs = currentInputs(selected.keys());
const reuse = reusableReceipts(prior, inputs);
const pending = new Map([...selected].filter(([path]) => !reuse.has(path)));
const renders = [...pending.values()].reduce(
  (sum, ids) => sum + ids.length * STORY_THEMES.length,
  0
);
log(
  `${selected.size} components with stories: ${reuse.size} reused, ${pending.size} to capture (${renders} renders)`
);
if (values.plan) {
  const shards = shardCount(renders, Number(values.plan) || 1);
  console.log(
    JSON.stringify({
      shards,
      matrix: Array.from({ length: shards }, (_, i) => i + 1),
      capture: pending.size,
      reused: reuse.size,
      renders,
    })
  );
  process.exit(0);
}

const sharded = values.shard !== undefined;
const owned = shardComponents(pending, parseShard(values.shard));
if (values.list) {
  for (const [path, ids] of owned) console.log(`${path}\t${ids.join(' ')}`);
  process.exit(0);
}

const components = new Map(
  [...owned].map(([path, storyIds]) => [
    path,
    { storyIds, ...inputs.get(path) },
  ])
);
const jobs = [];
for (const { storyIds } of components.values())
  for (const storyId of storyIds)
    for (const theme of STORY_THEMES) jobs.push({ storyId, theme });
log(
  `capturing ${jobs.length} story × theme renders for ${components.size} components`
);
/** Unsharded runs write a complete set: reused receipts plus new captures. */
function withReuse(evidence) {
  if (sharded) return evidence;
  for (const [path, receipts] of reuse) {
    evidence.visual.components[path] = receipts.visual;
    evidence.a11y.components[path] = receipts.a11y;
  }
  return evidence;
}
// No jobs: a shard with nothing to do writes an empty, mergeable result.
if (!jobs.length) {
  if (!selection.components.size) process.exit(1);
  writeEvidence(
    withReuse({ visual: { components: {} }, a11y: { components: {} } })
  );
  process.exit(0);
}

const webRequire = createRequire(join(root, 'apps/web/package.json'));
const { chromium } = webRequire('playwright');
const axeModule = await import(
  pathToFileURL(webRequire.resolve('@axe-core/playwright')).href
);
const AxeBuilder =
  axeModule.default?.default ?? axeModule.default ?? axeModule.AxeBuilder;
const timeoutMs = Number(values['timeout-ms']);

/** Runs in the preview before Storybook boots: record its render outcome. */
function watchStory({ key, theme }) {
  try {
    globalThis.localStorage.setItem(key, theme);
  } catch {}
  const state = { done: false, rendered: false, errors: [], pinnedTheme: null };
  globalThis.__jovieStoryState = state;
  const fail = name => payload => {
    const text = payload?.message ?? payload?.title ?? payload?.description;
    state.errors.push(`${name}${text ? `: ${text}` : ''}`);
    state.done = true;
  };
  const attach = () => {
    const channel = globalThis.__STORYBOOK_ADDONS_CHANNEL__;
    if (!channel) {
      setTimeout(attach, 5);
      return;
    }
    channel.on('storyRendered', () => {
      state.rendered = true;
      state.done = true;
    });
    // Story-level globals (globals: { theme }) force one theme over the seed.
    channel.on('globalsUpdated', payload => {
      const pinned = payload?.storyGlobals ?? {};
      state.pinnedTheme = pinned.themes?.value ?? pinned.theme ?? null;
    });
    channel.on('storyFinished', payload => {
      if (payload?.status === 'error') fail('storyFinished')(payload);
    });
    for (const name of [
      'storyErrored',
      'storyThrewException',
      'playFunctionThrewException',
      'unhandledErrorsWhilePlaying',
      'storyMissing',
    ])
      channel.on(name, fail(name));
  };
  attach();
}

async function waitForStory(page) {
  const deadline = Date.now() + timeoutMs;
  // A Vite dependency re-optimisation reloads the page once; keep waiting.
  while (Date.now() < deadline)
    try {
      const handle = await page.waitForFunction(
        () =>
          globalThis.__jovieStoryState?.done && globalThis.__jovieStoryState,
        null,
        { timeout: Math.max(1, deadline - Date.now()), polling: 50 }
      );
      return await handle.jsonValue();
    } catch (error) {
      if (!/context was destroyed|navigation/i.test(String(error))) break;
    }
  return { done: false, rendered: false, errors: [] };
}

async function captureOne(browser, { storyId, theme }) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  const errors = [];
  const record = text => {
    if (errors.length < MAX_ERRORS) errors.push(String(text).slice(0, 300));
  };
  const result = {
    storyId,
    theme,
    rendered: false,
    appliedTheme: null,
    pinnedTheme: null,
    errors,
    violations: [],
    screenshotSha256: null,
  };
  try {
    await context.addInitScript(watchStory, { key: THEME_STORAGE_KEY, theme });
    const page = await context.newPage();
    page.on('pageerror', error => record(`pageerror ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') record(`console ${message.text()}`);
    });
    await page.goto(storyUrl(baseUrl, storyId), {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    const state = await waitForStory(page);
    for (const error of state.errors) record(error);
    result.rendered = state.rendered && !state.errors.length;
    result.pinnedTheme = state.pinnedTheme ?? null;
    if (!result.rendered) return result;
    // Page-side callbacks (serialized, so no closures); scripts/ has no DOM lib.
    await page.evaluate(
      () => /** @type {any} */ (globalThis).document.fonts?.ready
    );
    result.appliedTheme = await page.evaluate(() => {
      const { document } = /** @type {any} */ (globalThis);
      const list = document.documentElement.classList;
      if (list.contains('dark')) return 'dark';
      return list.contains('light') ? 'light' : null;
    });
    let axe = new AxeBuilder({ page }).withTags(WCAG_22_AA_TAGS);
    for (const selector of STORYBOOK_CHROME) axe = axe.exclude(selector);
    const report = await axe.analyze();
    result.violations = report.violations.map(v => ({
      id: v.id,
      impact: v.impact ?? null,
      nodes: v.nodes.length,
    }));
    const png = await page.screenshot({ animations: 'disabled' });
    result.screenshotSha256 = createHash('sha256').update(png).digest('hex');
  } catch (error) {
    record(`capture ${error?.message ?? error}`);
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}

// Vite compiles the preview on first request; warm it once so that cold
// start cannot eat the per-story timeout. The warm-up records nothing.
async function warmUp(browser) {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/iframe.html`, { timeout: 180_000 });
    await page.waitForFunction(() => globalThis.__STORYBOOK_PREVIEW__, null, {
      timeout: 180_000,
    });
  } catch (error) {
    log(`warm-up did not finish: ${error?.message ?? error}`);
  } finally {
    await page.close().catch(() => {});
  }
}

const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  await warmUp(browser);
  let next = 0;
  const workers = Math.max(1, Number(values.concurrency) || 1);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const result = await captureOne(browser, job);
        captures.push(result);
        if (
          result.errors.length ||
          result.violations.length ||
          !result.rendered
        )
          log(
            `${job.storyId} [${job.theme}] ${result.rendered ? 'rendered' : 'did not render'}` +
              ` errors=${result.errors.length} axe=${result.violations.map(v => v.id).join(',') || 0}`
          );
      }
    })
  );
} finally {
  await browser.close();
}
// Nothing rendered at all is a broken Storybook, not component evidence:
// write no receipts (the certificate keeps its prior evidence) and go red.
if (jobs.length && !captures.some(c => c.rendered)) {
  log('no story rendered; Storybook or the browser is broken, writing nothing');
  process.exit(1);
}
writeEvidence(withReuse(assembleEvidence(components, captures)));
