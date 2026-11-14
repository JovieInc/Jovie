#!/usr/bin/env node
/**
 * Screen certification CLI (jovie.cert-screens/v1).
 *   node scripts/component-cert-screens.mjs                 coverage per screen
 *   node scripts/component-cert-screens.mjs --json          coverage + ranked issues as JSON
 *   node scripts/component-cert-screens.mjs --issues out.json
 *        ranked failing components for an agent loop (most screens first)
 *   node scripts/component-cert-screens.mjs --refresh       shrink debt to what still fails
 *        (a criterion the base registry lacks starts as debt for whatever fails it)
 *   node scripts/component-cert-screens.mjs --enroll <id> --page apps/web/app/x/page.tsx [--route /x] [--stage reach]
 *        add a screen; its current failures become debt, everything new must pass
 * The merge gate itself runs inside `pnpm component-certificate:gate`.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './component-ship-policy.mjs';
import {
  currentDebt,
  debtEntry,
  evaluateScreenGates,
  owedCriteria,
  readBaseScreens,
  readScreens,
  SCREEN_STAGES,
  screenComponents,
  screenIssues,
  sortByPath,
} from './lib/component-cert-screens.mjs';

const { values } = parseArgs({
  options: {
    'repo-root': { type: 'string', default: REPO_ROOT },
    registry: {
      type: 'string',
      default: 'docs/design-system/cert-screens.json',
    },
    json: { type: 'boolean', default: false },
    issues: { type: 'string' },
    refresh: { type: 'boolean', default: false },
    enroll: { type: 'string' },
    page: { type: 'string' },
    route: { type: 'string' },
    stage: { type: 'string' },
    base: { type: 'string', default: 'origin/main' },
    'mutation-state': { type: 'string' },
    a11y: { type: 'string' },
    visual: { type: 'string' },
  },
});

const root = values['repo-root'];
const registryPath = join(root, values.registry);
const screens = readScreens(root, values.registry);
if (!screens) {
  console.error(`no screen registry at ${values.registry}`);
  process.exit(2);
}

if (values.enroll) {
  if (!values.page) {
    console.error('--enroll needs --page apps/web/app/.../page.tsx');
    process.exit(2);
  }
  if (screens.screens[values.enroll]) {
    console.error(`screen ${values.enroll} is already enrolled`);
    process.exit(2);
  }
  if (
    !/^apps\/web\/app\/.*page\.tsx$/.test(values.page) ||
    !existsSync(join(root, values.page))
  ) {
    console.error(`--page ${values.page} is not an App Router page.tsx`);
    process.exit(2);
  }
  if (values.stage && !SCREEN_STAGES.includes(values.stage)) {
    console.error(`--stage must be one of ${SCREEN_STAGES.join(', ')}`);
    process.exit(2);
  }
  screens.screens[values.enroll] = {
    page: values.page,
    ...(values.route ? { route: values.route } : {}),
    ...(values.stage ? { stage: values.stage } : {}),
  };
}

const byScreen = screenComponents(root, screens);
const components = [...new Set([...byScreen.values()].flat())].sort();

function certify(list) {
  const dir = mkdtempSync(join(tmpdir(), 'cert-screens-'));
  try {
    const out = join(dir, 'report.json');
    const evidence = [];
    for (const kind of ['mutation-state', 'a11y', 'visual'])
      if (values[kind]) evidence.push(`--${kind}`, values[kind]);
    const args = [
      join(root, 'scripts/component-certificate.mjs'),
      '--repo-root',
      root,
      // --all discovers each component's colocated and tests/ companions the
      // same way the merge gate does; --component adds app-route files.
      '--all',
      '--out',
      out,
      ...evidence,
      ...list.flatMap(c => ['--component', c]),
    ];
    const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
    if (run.status !== 0) {
      process.stderr.write(run.stderr || run.stdout);
      process.exit(run.status ?? 1);
    }
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const report = certify(components);
const issues = screenIssues(report, screens, byScreen);

function write(next) {
  writeFileSync(registryPath, `${JSON.stringify(next, null, 2)}\n`);
}

if (values.enroll || values.refresh) {
  const fresh = currentDebt(report, screens, byScreen);
  const next = {};
  const enrolled = values.enroll
    ? new Set(byScreen.get(values.enroll))
    : new Set();
  // Refresh only ever shrinks an entry; enrollment may add the new screen's,
  // and a criterion new against the base registry adds what fails it.
  const base = readBaseScreens(root, values.registry, values.base);
  const added = new Set(
    base
      ? screens.criteria.filter(id => !(base.criteria ?? []).includes(id))
      : []
  );
  for (const [component, entry] of Object.entries(fresh)) {
    const failing = owedCriteria(entry);
    const owed = owedCriteria(screens.debt?.[component]);
    if (enrolled.has(component))
      next[component] = debtEntry([...owed, ...failing]);
    else {
      const kept = [
        ...owed.filter(id => failing.includes(id)),
        ...failing.filter(id => added.has(id)),
      ];
      if (kept.length) next[component] = debtEntry(kept);
    }
  }
  screens.debt = sortByPath(next);
  write(screens);
}

const result = evaluateScreenGates(report, screens, byScreen);
const total = components.length;
const passing = total - issues.length;
const summary = {
  schema: 'jovie.cert-screens-report/v1',
  criteria: screens.criteria,
  totals: { components: total, passing, failing: issues.length },
  screens: result.perScreen,
};

if (values.issues)
  writeFileSync(
    values.issues,
    `${JSON.stringify({ ...summary, issues }, null, 2)}\n`
  );
if (values.json) console.log(JSON.stringify({ ...summary, issues }, null, 2));
else {
  console.log(
    `screen coverage: ${passing}/${total} components pass ${screens.criteria.join(', ')}`
  );
  for (const s of result.perScreen)
    console.log(
      `  ${s.id.padEnd(30)} ${String(s.passing).padStart(4)}/${s.components}${s.passing === s.components ? ' must-pass' : ''}`
    );
  if (!result.ok && !values.refresh && !values.enroll)
    console.log(
      `gate would fail: ${result.failures.length} new failure(s), ${result.stale.length} stale debt entr(ies), ${result.errors.length} config error(s)`
    );
}
