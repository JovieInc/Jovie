#!/usr/bin/env node
/**
 * JOV-INV-047: one canonical shell and IA across every Jovie surface.
 *
 * Registry: apps/web/data/surfaceIa/registry.json
 * Contract: docs/design-system/shell-ia.md
 *
 * Checks (all fail closed):
 *   1. primitives    every registered primitive file exists and exports its name.
 *   2. reachability  every registered route reaches its surface shell through
 *                    its layouts and page (reuses the layout-guard import walker
 *                    in scripts/layout-guard-pen-contracts.mjs; no second walker).
 *   3. navigation    every surface navigation source exports its declared symbol,
 *                    and the app rail stays within its root-item cap.
 *   4. ad-hoc chrome raw <nav>/<aside> elements in route and feature code outside
 *                    registered chrome owners are ratcheted per file in
 *                    shell-ia.baseline.json. New files or higher counts fail;
 *                    lower counts pass with a notice; lock them with --update.
 *   5. sub-nav       app routes render RouteSegmentControl with surface='ghost'
 *                    (the one flat sub-navigation treatment). Plate-rail uses
 *                    are ratcheted the same way.
 *
 * Usage: node scripts/invariants/shell-ia.mjs [--update] [--json]
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reaches, routeFiles } from '../layout-guard-pen-contracts.mjs';

export const SHELL_IA_INVARIANT_ID = 'JOV-INV-047';
const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
export const REGISTRY_PATH = 'apps/web/data/surfaceIa/registry.json';
export const BASELINE_PATH = 'scripts/invariants/shell-ia.baseline.json';

/** Route and feature code where page chrome must come from registered owners. */
export const CHROME_SCAN_ROOTS = Object.freeze([
  'apps/web/app',
  'apps/web/components/features',
]);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '__tests__',
  'exp',
  'dev',
  'sandbox',
  'ui',
  'demo',
]);
const isScannable = file =>
  /\.tsx$/.test(file) && !/\.(test|spec|stories)\.tsx$/.test(file);

const RAW_CHROME_RE = /<(nav|aside)[\s>]/g;
const SUBNAV_RE = /<RouteSegmentControl\b([^>]*)>/gs;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (isScannable(full)) out.push(full);
  }
  return out;
}

const posix = (root, abs) => path.relative(root, abs).split(path.sep).join('/');

export function readRegistry(root = DEFAULT_ROOT) {
  return JSON.parse(readFileSync(path.join(root, REGISTRY_PATH), 'utf8'));
}

function exportsName(text, name) {
  return new RegExp(
    `export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|class|let)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`
  ).test(text);
}

export function checkPrimitives({ root, registry }) {
  const webDir = path.join(root, 'apps', 'web');
  const findings = [];
  const refs = [
    ...Object.entries(registry.primitives).map(([id, p]) => [
      `primitive ${id}`,
      p,
    ]),
    ...Object.entries(registry.northStar?.motionGrammar ?? {}).map(
      ([id, p]) => [`motion ${id}`, p]
    ),
    ...registry.surfaces
      .filter(s => s.navigation)
      .map(s => [`navigation ${s.id}`, s.navigation]),
  ];
  for (const [label, ref] of refs) {
    const file = path.resolve(webDir, ref.source);
    if (!existsSync(file)) {
      findings.push({
        kind: 'missing-source',
        detail: `${label}: ${ref.source}`,
      });
      continue;
    }
    if (!exportsName(readFileSync(file, 'utf8'), ref.export)) {
      findings.push({
        kind: 'missing-export',
        detail: `${label}: ${ref.source} does not export ${ref.export}`,
      });
    }
  }
  for (const surface of registry.surfaces) {
    for (const key of ['shell', 'header']) {
      const id = surface[key];
      if (id && !registry.primitives[id]) {
        findings.push({
          kind: 'unknown-primitive',
          detail: `${surface.id}.${key} -> ${id}`,
        });
      }
    }
  }
  return findings;
}

export function checkReachability({ root, registry }) {
  const webDir = path.join(root, 'apps', 'web');
  const appDir = path.join(webDir, 'app');
  const findings = [];
  for (const surface of registry.surfaces) {
    const shell = registry.primitives[surface.shell];
    if (!shell) continue;
    const emitter = {
      file: path.resolve(webDir, shell.source),
      names: [shell.export],
    };
    for (const route of surface.routes) {
      const roots = routeFiles(appDir, route);
      if (roots.length === 0) {
        findings.push({
          kind: 'unresolved-route',
          detail: `${surface.id}: ${route} has no page`,
        });
        continue;
      }
      if (!reaches({ roots, webDir, emitters: [emitter] })) {
        findings.push({
          kind: 'shell-unreachable',
          detail: `${surface.id}: ${route} does not render ${shell.export} through its layouts`,
        });
      }
    }
  }
  return findings;
}

export function checkNavigationCaps({ root, registry }) {
  const findings = [];
  const app = registry.surfaces.find(s => s.id === 'app');
  if (!app?.navigation?.maxRootItems) return findings;
  const file = path.join(root, 'apps', 'web', app.navigation.source);
  const text = readFileSync(file, 'utf8');
  const match = new RegExp(
    `export const ${app.navigation.export}\\s*=\\s*\\[([^\\]]*)\\]`,
    's'
  ).exec(text);
  if (!match) {
    findings.push({
      kind: 'navigation-unparseable',
      detail: `${app.navigation.export} is not a literal tuple`,
    });
    return findings;
  }
  const items = match[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (items.length > app.navigation.maxRootItems) {
    findings.push({
      kind: 'navigation-over-cap',
      detail: `${app.navigation.export} has ${items.length} root items (cap ${app.navigation.maxRootItems}); new destinations are pinned canvas views`,
    });
  }
  return findings;
}

/** Per-file counts of ad-hoc chrome and plate-rail sub-navigation. */
export function measureDebt({ root, registry }) {
  const owners = registry.chromeOwners.map(o => `apps/web/${o}`);
  const rawChrome = {};
  const plateSubNav = {};
  for (const scanRoot of CHROME_SCAN_ROOTS) {
    for (const abs of walk(path.join(root, scanRoot))) {
      const rel = posix(root, abs);
      const text = readFileSync(abs, 'utf8');
      if (!owners.some(o => rel.startsWith(o))) {
        const count = [...text.matchAll(RAW_CHROME_RE)].length;
        if (count) rawChrome[rel] = count;
      }
      if (rel.startsWith('apps/web/app/app/')) {
        const plates = [...text.matchAll(SUBNAV_RE)].filter(
          m => !/surface=['"{]+ghost/.test(m[1])
        ).length;
        if (plates) plateSubNav[rel] = plates;
      }
    }
  }
  return { rawChrome, plateSubNav };
}

/**
 * Growth fails; a shrink passes with a notice (same policy as the other
 * shrink-only ratchets, #23659). Lock a shrink with --update.
 */
export function compareDebt(current, baseline, notices = []) {
  const findings = [];
  for (const key of ['rawChrome', 'plateSubNav']) {
    const now = current[key] ?? {};
    const base = baseline[key] ?? {};
    for (const [file, count] of Object.entries(now)) {
      if (!(file in base))
        findings.push({ kind: `${key}-new`, detail: `${file} (${count})` });
      else if (count > base[file])
        findings.push({
          kind: `${key}-grew`,
          detail: `${file} ${base[file]} -> ${count}`,
        });
    }
    for (const [file, count] of Object.entries(base)) {
      if ((now[file] ?? 0) < count) {
        notices.push({
          kind: `${key}-shrank`,
          detail: `${file} ${count} -> ${now[file] ?? 0}; run pnpm design:shell-ia:update to lock the shrink`,
        });
      }
    }
  }
  return findings;
}

export function readBaseline(root = DEFAULT_ROOT) {
  const file = path.join(root, BASELINE_PATH);
  return existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : { rawChrome: {}, plateSubNav: {} };
}

export function validateShellIa({
  root = DEFAULT_ROOT,
  registry = readRegistry(root),
  baseline = readBaseline(root),
} = {}) {
  const debt = measureDebt({ root, registry });
  const notices = [];
  const findings = [
    ...checkPrimitives({ root, registry }),
    ...checkReachability({ root, registry }),
    ...checkNavigationCaps({ root, registry }),
    ...compareDebt(debt, baseline, notices),
  ];
  return { ok: findings.length === 0, findings, notices, debt };
}

function sorted(record) {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b))
  );
}

export function main(
  argv = process.argv.slice(2),
  root = DEFAULT_ROOT,
  log = console.log
) {
  const registry = readRegistry(root);
  if (argv.includes('--update')) {
    const debt = measureDebt({ root, registry });
    const baseline = {
      _comment: `${SHELL_IA_INVARIANT_ID} shrink-only ratchet. Raw <nav>/<aside> outside registered chrome owners, and plate-rail RouteSegmentControl in app routes. Lower counts by moving chrome into the shell primitives, then run node scripts/invariants/shell-ia.mjs --update.`,
      rawChrome: sorted(debt.rawChrome),
      plateSubNav: sorted(debt.plateSubNav),
    };
    writeFileSync(
      path.join(root, BASELINE_PATH),
      `${JSON.stringify(baseline, null, 2)}\n`
    );
    log(`${SHELL_IA_INVARIANT_ID}: baseline written`);
    return 0;
  }
  const result = validateShellIa({ root, registry });
  if (argv.includes('--json')) log(JSON.stringify(result, null, 2));
  else if (result.ok) {
    for (const n of result.notices)
      log(`::notice::${SHELL_IA_INVARIANT_ID} ${n.kind}: ${n.detail}`);
    log(`${SHELL_IA_INVARIANT_ID}: shell and IA registry holds`);
  } else
    for (const f of result.findings)
      log(`${SHELL_IA_INVARIANT_ID} ${f.kind}: ${f.detail}`);
  return result.ok ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}
