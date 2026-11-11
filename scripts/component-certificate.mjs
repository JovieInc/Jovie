#!/usr/bin/env node
/**
 * Component certificate CLI.
 *   node scripts/component-certificate.mjs --all [--out report.json] [--summary]
 *   node scripts/component-certificate.mjs --component apps/web/components/x/Y.tsx [--spec]
 *   node scripts/component-certificate.mjs --gate   (fail on any gated criterion in component-certification.json)
 *   node scripts/component-certificate.mjs --sort   (sort gates, waivers and screen debt by component path)
 * Optional evidence inputs (absent evidence = `unknown`, which counts as missing):
 *   --mutation-state sweep-state.json  --a11y a11y.json  --visual visual.json  --journeys journeys.json
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  COVERAGE_ROOTS,
  listComponentsInRoot,
  REPO_ROOT,
} from './component-ship-policy.mjs';
import { applyBenchmarkReview } from './lib/component-benchmark-review.mjs';
import {
  buildReport,
  certifyComponent,
  DEFAULT_POLICY,
  renderAgentSpec,
  summarizeGuards,
} from './lib/component-certificate.mjs';
import {
  loadMutationInventory,
  mutationStateKey,
  mutationTestsFor,
} from './lib/component-certificate-mutation.mjs';
import { acceptStoryReceipts } from './lib/component-evidence.mjs';

const { values } = parseArgs({
  options: {
    all: { type: 'boolean', default: false },
    component: { type: 'string', multiple: true },
    out: { type: 'string' },
    spec: { type: 'boolean', default: false },
    summary: { type: 'boolean', default: false },
    'repo-root': { type: 'string', default: REPO_ROOT },
    'mutation-state': { type: 'string' },
    a11y: { type: 'string' },
    visual: { type: 'string' },
    journeys: {
      type: 'string',
      default: 'docs/design-system/component-journeys.json',
    },
    benchmarks: {
      type: 'string',
      default: 'docs/design-system/component-benchmarks.json',
    },
    registry: {
      type: 'string',
      default: 'docs/design-system/component-certification.json',
    },
    sha: { type: 'string', default: 'unknown' },
    guards: { type: 'boolean', default: false },
    gate: { type: 'boolean', default: false },
    sort: { type: 'boolean', default: false },
    screens: {
      type: 'string',
      default: 'docs/design-system/cert-screens.json',
    },
    // Base ref whose cert-screens.json debt may not grow (CI: origin/main).
    'screens-base': { type: 'string', default: 'origin/main' },
    'guard-registry': {
      type: 'string',
      default: 'docs/design-system/defect-guard-registry.json',
    },
  },
});

const root = values['repo-root'];
const readJson = (p, fallback) => {
  if (!p) return fallback;
  const abs = p.startsWith('/') ? p : join(root, p);
  if (!existsSync(abs)) return fallback;
  return JSON.parse(readFileSync(abs, 'utf8'));
};
const read = rel => {
  const abs = join(root, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
};
// Evidence for one component may span companion files (button.test.tsx plus
// button.certificate.test.tsx, button.stories.tsx plus button.states.stories.tsx)
// so each file stays under the repo's 500-line cap; the certificate reads them as one.
const readWithCompanions = (rel, suffix) => {
  const dir = dirname(rel);
  const base = basename(rel, suffix);
  let names = [];
  try {
    names = readdirSync(join(root, dir));
  } catch {}
  const companions = names
    .filter(
      n =>
        n !== `${base}${suffix}` &&
        n.startsWith(`${base}.`) &&
        n.endsWith(suffix)
    )
    .sort();
  const parts = [rel, ...companions.map(n => join(dir, n))]
    .map(read)
    .filter(text => typeof text === 'string');
  return parts.length ? parts.join('\n') : null;
};

// gates, waivers and screen debt stay sorted by component path (the gate
// checks it), so a new entry lands at its own place rather than where every
// PR appends.
if (values.sort) {
  const { sortByPath } = await import('./lib/component-cert-screens.mjs');
  /** @type {{rel: string, keys: string[]}[]} */
  const files = [
    { rel: values.registry, keys: ['gates', 'waivers'] },
    { rel: values.screens, keys: ['debt'] },
  ];
  for (const { rel, keys } of files) {
    const abs = rel.startsWith('/') ? rel : join(root, rel);
    if (!existsSync(abs)) continue;
    const doc = JSON.parse(readFileSync(abs, 'utf8'));
    for (const key of keys) if (doc[key]) doc[key] = sortByPath(doc[key]);
    writeFileSync(abs, `${JSON.stringify(doc, null, 2)}\n`);
  }
  process.exit(0);
}

if (values.guards) {
  const s = summarizeGuards(
    readJson(values['guard-registry'], { defects: [] })
  );
  console.log(JSON.stringify(s, null, 1));
  process.exit(s.errors.length ? 1 : 0);
}

const registry = readJson(values.registry, { policy: {}, waivers: {} });
const policy = { ...DEFAULT_POLICY, ...(registry.policy ?? {}) };
const mutation =
  readJson(values['mutation-state'], { modules: {} }).modules ?? {};
// Story-capture receipts count only when every story was captured in light
// and dark; partial passes are dropped (and listed) rather than trusted.
const receipts = kind => {
  const { components, rejected } = acceptStoryReceipts(
    readJson(values[kind], { components: {} }).components
  );
  for (const r of rejected)
    console.error(
      `[component-certificate] ignored ${kind} receipt for ${r.path}: ${r.problem}`
    );
  return components;
};
const a11y = receipts('a11y');
const visual = receipts('visual');
const journeyMap = readJson(values.journeys, { components: {}, journeys: {} });
const benchmarks =
  readJson(values.benchmarks, { components: {} }).components ?? {};

// Match mutation-sweep's per-root same-stem test inventory (apps/web and
// packages/ui), but hash the bytes being certified rather than index blobs:
// local source/test edits must invalidate an old run even before they are
// staged. Missing Git/input evidence stays unknown.
const mutationInventory = Object.keys(mutation).length
  ? loadMutationInventory(root, read)
  : null;

/** @type {any[]} */
let list = [];
if (values.all || values.gate)
  for (const r of [...new Set(COVERAGE_ROOTS)])
    list.push(...listComponentsInRoot(r, root));
const seen = new Set();
list = list.filter(c =>
  seen.has(c.sourceRel) ? false : seen.add(c.sourceRel)
);
// A gate key naming one .tsx file outside the coverage roots (an app-route
// component such as app/[username]/_components/X.tsx) is certified as if
// passed with --component; a missing file still fails "matches no component".
const gatedFiles = values.gate
  ? Object.keys(registry.gates ?? {}).filter(
      k => k.endsWith('.tsx') && existsSync(join(root, k))
    )
  : [];
// Every component an enrolled screen renders is certified too, so the screen
// gate below judges app-route components outside the coverage roots.
const screenRegistry = values.gate
  ? (await import('./lib/component-cert-screens.mjs')).readScreens(
      root,
      values.screens
    )
  : null;
const byScreen = screenRegistry
  ? (await import('./lib/component-cert-screens.mjs')).screenComponents(
      root,
      screenRegistry
    )
  : new Map();
const screenFiles = [...new Set([...byScreen.values()].flat())];
// The prefix gates keep judging exactly what they judged before screens
// existed; a file only a screen brings in is judged by the screen gate.
const prefixGateScope = new Set([
  ...seen,
  ...(values.component ?? []),
  ...gatedFiles,
]);
for (const rel of [...(values.component ?? []), ...gatedFiles, ...screenFiles])
  if (!seen.has(rel) && seen.add(rel))
    list.push({
      sourceRel: rel,
      testRel: rel.replace(/\.tsx$/, '.test.tsx'),
      storyRel: rel.replace(/\.tsx$/, '.stories.tsx'),
    });
if (!values.all && values.component)
  list = list.filter(c => values.component.includes(c.sourceRel));

const certificates = list.map(c => {
  const source = read(c.sourceRel) ?? '';
  const testSource = c.testRel
    ? readWithCompanions(c.testRel, '.test.tsx')
    : null;
  const storySource = c.storyRel
    ? readWithCompanions(c.storyRel, '.stories.tsx')
    : null;
  const mutationTests = mutationTestsFor(mutationInventory, c.sourceRel);
  const jm = journeyMap.components?.[c.sourceRel];
  const journeys = jm
    ? {
        journeys: jm,
        uncovered: jm.filter(
          j => !(journeyMap.journeys?.[j]?.specs ?? []).length
        ),
      }
    : null;
  const cert = certifyComponent({
    path: c.sourceRel,
    source,
    testSource,
    storySource,
    mutationTestSources: mutationTests?.every(text => typeof text === 'string')
      ? mutationTests
      : null,
    waivers: registry.waivers?.[c.sourceRel] ?? {},
    policy,
    packagesUi: c.sourceRel.startsWith('packages/ui/'),
    evidence: {
      mutation: mutation[mutationStateKey(c.sourceRel)],
      a11y: a11y[c.sourceRel],
      visual: visual[c.sourceRel],
      journeys,
      benchmark: benchmarks[c.sourceRel],
    },
  });
  // A current judgment must also record what it was compared against.
  return applyBenchmarkReview(cert, benchmarks[c.sourceRel]);
});

const report = buildReport({ certificates, headSha: values.sha });
if (values.gate) {
  // Loaded only for --gate so the report CLI keeps its minimal import closure.
  const { evaluateCertificateGates, formatGateResult } = await import(
    './lib/component-certificate-gate.mjs'
  );
  const result = evaluateCertificateGates(
    {
      ...report,
      certificates: report.certificates.filter(c =>
        prefixGateScope.has(c.component)
      ),
    },
    registry.gates ?? {}
  );
  const { unsortedPathErrors } = await import(
    './lib/component-cert-screens.mjs'
  );
  const orderErrors = ['gates', 'waivers'].flatMap(key =>
    unsortedPathErrors(`${values.registry}: ${key}`, registry[key])
  );
  if (orderErrors.length) {
    result.errors.push(...orderErrors);
    result.ok = false;
  }
  console.log(formatGateResult(result));
  let screensOk = true;
  if (screenRegistry) {
    const { evaluateScreenGates, formatScreenGate, readBaseScreens } =
      await import('./lib/component-cert-screens.mjs');
    const screenResult = evaluateScreenGates(
      report,
      screenRegistry,
      byScreen,
      readBaseScreens(root, values.screens, values['screens-base'])
    );
    console.log(formatScreenGate(screenResult));
    screensOk = screenResult.ok;
  }
  process.exit(result.ok && screensOk ? 0 : 1);
}
if (values.out)
  writeFileSync(values.out, `${JSON.stringify(report, null, 1)}\n`);
if (values.spec)
  for (const c of certificates)
    if (!c.certified)
      console.log(
        renderAgentSpec(c, {
          benchmarkGaps: (benchmarks[c.component]?.gaps ?? []).filter(
            g => g.decision !== 'skip' && g.status !== 'done'
          ),
        })
      );
if (values.summary || !values.out) {
  const t = report.totals;
  console.log(`components ${t.components}, certified ${t.certified}`);
  for (const [k, v] of Object.entries(t.byCriterion))
    console.log(
      `  ${k.padEnd(15)} pass ${v.pass} fail ${v.fail} unknown ${v.unknown} na ${v.na}`
    );
}
