#!/usr/bin/env node
/**
 * Component certificate CLI.
 *   node scripts/component-certificate.mjs --all [--out report.json] [--summary]
 *   node scripts/component-certificate.mjs --component apps/web/components/x/Y.tsx [--spec]
 * Optional evidence inputs (absent evidence = `unknown`, which counts as missing):
 *   --mutation-state sweep-state.json  --a11y a11y.json  --visual visual.json  --journeys journeys.json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  COVERAGE_ROOTS,
  listComponentsInRoot,
  REPO_ROOT,
} from './component-ship-policy.mjs';
import {
  buildReport,
  certifyComponent,
  DEFAULT_POLICY,
  renderAgentSpec,
  summarizeGuards,
} from './lib/component-certificate.mjs';

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
const a11y = readJson(values.a11y, { components: {} }).components ?? {};
const visual = readJson(values.visual, { components: {} }).components ?? {};
const journeyMap = readJson(values.journeys, { components: {}, journeys: {} });
const benchmarks =
  readJson(values.benchmarks, { components: {} }).components ?? {};

// Match mutation-sweep's same-stem test inventory, but hash the bytes being
// certified rather than index blobs: local source/test edits must invalidate
// an old run even before they are staged. Missing Git/input evidence stays
// unknown; it must not fall back to a smaller test set with a different key.
const mutationInventory = (() => {
  if (!Object.keys(mutation).length) return null;
  try {
    const paths = execFileSync('git', ['ls-files', '-z', '--', 'apps/web'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\0')
      .filter(Boolean);
    const tests = new Map();
    for (const path of paths) {
      const match = /([^/]+)\.test\.tsx?$/.exec(path);
      if (!match) continue;
      tests.set(match[1], [...(tests.get(match[1]) ?? []), read(path)]);
    }
    return { tracked: new Set(paths), tests };
  } catch {
    return null;
  }
})();

/** @type {any[]} */
let list = [];
if (values.all)
  for (const r of [...new Set(COVERAGE_ROOTS)])
    list.push(...listComponentsInRoot(r, root));
const seen = new Set();
list = list.filter(c =>
  seen.has(c.sourceRel) ? false : seen.add(c.sourceRel)
);
for (const rel of values.component ?? [])
  if (!seen.has(rel))
    list.push({
      sourceRel: rel,
      testRel: rel.replace(/\.tsx$/, '.test.tsx'),
      storyRel: rel.replace(/\.tsx$/, '.stories.tsx'),
    });
if (!values.all && values.component)
  list = list.filter(c => values.component.includes(c.sourceRel));

const certificates = list.map(c => {
  const source = read(c.sourceRel) ?? '';
  const testSource = c.testRel ? read(c.testRel) : null;
  const storySource = c.storyRel ? read(c.storyRel) : null;
  const mutationTests = mutationInventory?.tracked.has(c.sourceRel)
    ? (mutationInventory.tests.get(
        c.sourceRel
          .split('/')
          .pop()
          .replace(/\.tsx?$/, '')
      ) ?? [])
    : null;
  const webRel = c.sourceRel.replace(/^apps\/web\//, '');
  const jm = journeyMap.components?.[c.sourceRel];
  const journeys = jm
    ? {
        journeys: jm,
        uncovered: jm.filter(
          j => !(journeyMap.journeys?.[j]?.specs ?? []).length
        ),
      }
    : null;
  return certifyComponent({
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
      mutation: mutation[webRel],
      a11y: a11y[c.sourceRel],
      visual: visual[c.sourceRel],
      journeys,
      benchmark: benchmarks[c.sourceRel],
    },
  });
});

const report = buildReport({ certificates, headSha: values.sha });
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
