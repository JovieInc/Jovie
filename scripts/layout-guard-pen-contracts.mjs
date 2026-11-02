#!/usr/bin/env node
/**
 * PR-time guard: every route a required layout-guard spec visits must still
 * render the `data-pen-contract` ids that spec locates.
 *
 * Why: #23332 removed the FAQ from /about while
 * tests/e2e/marketing-faq-width-invariance.spec.ts still located
 * [data-pen-contract="pAAhw"] on /about. Nothing on the PR failed, so the
 * merge group failed `Run deterministic layout behavior guard` and the PR was
 * ejected three times (each ejection rebuilds every group behind it).
 *
 * How (static, no build): spec routes (`path: '/x'`, `page.goto('/x')`) map to
 * the route's page.tsx and the layouts above it; the import graph from those
 * files (barrels narrowed to the names actually imported) must reach a file
 * that renders a component exported by an emitter of the contract id. Emitters
 * are the non-test files that name the id literally or via
 * MARKETING_PEN_CONTRACT_IDS.<group>.<key>. A contract with no emitter in
 * source is reported as unresolved, not failed (cannot be proven either way).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  OPTIONAL_LAYOUT_GUARD_SPECS,
  REQUIRED_LAYOUT_GUARD_SPECS,
} from '../.github/scripts/layout-guard-manifest.mjs';

const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs'];
const PAGE_NAMES = EXTS.map(ext => `page${ext}`);
const LAYOUT_NAMES = EXTS.map(ext => `layout${ext}`);
const SKIP_DIR = new Set(['node_modules', '.next', 'tests', '__tests__']);
const isSource = file =>
  /\.(tsx?|jsx?|mjs)$/.test(file) &&
  !/\.(test|spec|stories)\.[a-z]+$/.test(file);

export function specContracts(specText) {
  return [
    ...new Set(
      [...specText.matchAll(/data-pen-contract=\\?["']([^"'\\\]]+)/g)].map(
        m => m[1]
      )
    ),
  ];
}

export function specRoutes(specText) {
  const found = new Set();
  for (const m of specText.matchAll(/\bpath:\s*'(\/[^'?#]*)'/g))
    found.add(m[1]);
  for (const m of specText.matchAll(/\.goto\(\s*'(\/[^'?#]*)'/g))
    found.add(m[1]);
  return [...found];
}

function listFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) listFiles(full, out);
    else if (isSource(full)) out.push(full);
  }
  return out;
}

/** Page and layout files serving `route` under app/, route groups included. */
export function routeFiles(appDir, route) {
  const segments = route.split('/').filter(Boolean);
  const results = new Set();
  const visit = (dir, rest, layouts) => {
    const here = [
      ...layouts,
      ...LAYOUT_NAMES.map(n => path.join(dir, n)).filter(existsSync),
    ];
    if (rest.length === 0) {
      const page = PAGE_NAMES.map(n => path.join(dir, n)).find(existsSync);
      if (page) for (const f of [...here, page]) results.add(f);
    }
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      if (/^\(.+\)$/.test(name)) visit(full, rest, here);
      else if (rest.length && (name === rest[0] || /^\[[^\]]+\]$/.test(name)))
        visit(full, rest.slice(1), here);
    }
  };
  if (existsSync(appDir)) visit(appDir, segments, []);
  return [...results];
}

function resolveModule(spec, from, webDir) {
  let base;
  if (spec.startsWith('@/')) base = path.join(webDir, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [
    base,
    ...EXTS.map(ext => base + ext),
    ...EXTS.map(ext => path.join(base, `index${ext}`)),
  ])
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?([\w*${}\s,]*?)\s*from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;

function parseImports(text) {
  const edges = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const clause = m[1] ?? '';
    const spec = m[2] ?? m[3] ?? m[4];
    const braces = /\{([^}]*)\}/.exec(clause);
    const names = braces
      ? braces[1]
          .split(',')
          .map(
            s =>
              s
                .trim()
                .replace(/^type\s+/, '')
                .split(/\s+as\s+/)[0]
          )
          .filter(Boolean)
      : null;
    edges.push({ spec, names });
  }
  return edges;
}

/** A barrel only re-exports; follow just the names an importer asked for. */
function isBarrel(text) {
  return (
    !/<[A-Za-z]/.test(text) &&
    /\bexport\s/.test(text) &&
    !/\bfunction\b|=>/.test(text)
  );
}

export function idToKeys(penText) {
  const map = new Map();
  for (const m of penText.matchAll(/(\w+):\s*'([^']+)'/g)) {
    const group = map.get(m[2]) ?? [];
    group.push(m[1]);
    map.set(m[2], group);
  }
  return map;
}

export function findEmitters({ webDir, files, id, keys }) {
  const patterns = [
    id,
    ...keys.map(k => new RegExp(`MARKETING_PEN_CONTRACT_IDS\\.\\w+\\.${k}\\b`)),
  ];
  const emitters = [];
  for (const file of files) {
    if (file.endsWith(path.join('data', 'marketing', 'penContracts.ts')))
      continue;
    const text = readFileSync(file, 'utf8');
    if (
      patterns.some(p =>
        typeof p === 'string' ? text.includes(p) : p.test(text)
      )
    ) {
      const names = [
        ...text.matchAll(
          /export\s+(?:default\s+)?(?:function|const)\s+([A-Z]\w*)/g
        ),
      ].map(m => m[1]);
      emitters.push({ file, names });
    }
  }
  return emitters;
}

export function reaches({ roots, webDir, emitters }) {
  const emitterNames = new Set(emitters.flatMap(e => e.names));
  const emitterFiles = new Set(emitters.map(e => e.file));
  const seen = new Map(); // file -> Set(names) | 'all'
  const queue = roots.map(file => ({ file, names: 'all' }));
  while (queue.length) {
    const { file, names } = queue.pop();
    const prior = seen.get(file);
    if (prior === 'all') continue;
    if (names !== 'all' && prior && names.every(n => prior.has(n))) continue;
    seen.set(
      file,
      names === 'all' ? 'all' : new Set([...(prior ?? []), ...names])
    );
    const text = readFileSync(file, 'utf8');
    const barrel = isBarrel(text);
    if (emitterFiles.has(file) && roots.includes(file)) return true;
    for (const name of emitterNames)
      if (new RegExp(`<${name}[\\s/>]`).test(text) && !emitterFiles.has(file))
        return true;
    for (const edge of parseImports(text)) {
      const target = resolveModule(edge.spec, file, webDir);
      if (!target || !isSource(target)) continue;
      if (barrel && names !== 'all') {
        // only follow re-export lines that mention a requested name
        if (edge.names && !edge.names.some(n => names.includes(n))) continue;
      }
      queue.push({ file: target, names: edge.names ?? 'all' });
    }
  }
  return false;
}

export function checkLayoutGuardContracts({ root = DEFAULT_ROOT } = {}) {
  const webDir = path.join(root, 'apps', 'web');
  const appDir = path.join(webDir, 'app');
  const penFile = path.join(webDir, 'data', 'marketing', 'penContracts.ts');
  const keyMap = existsSync(penFile)
    ? idToKeys(readFileSync(penFile, 'utf8'))
    : new Map();
  const files = [
    ...listFiles(path.join(webDir, 'app')),
    ...listFiles(path.join(webDir, 'components')),
    ...listFiles(path.join(webDir, 'features')),
  ];
  const failures = [];
  const unresolved = [];
  for (const spec of [
    ...REQUIRED_LAYOUT_GUARD_SPECS,
    ...OPTIONAL_LAYOUT_GUARD_SPECS,
  ]) {
    const specPath = path.join(webDir, spec);
    if (!existsSync(specPath)) continue;
    const text = readFileSync(specPath, 'utf8');
    const routes = specRoutes(text);
    for (const id of specContracts(text)) {
      const emitters = findEmitters({
        webDir,
        files,
        id,
        keys: keyMap.get(id) ?? [],
      });
      if (emitters.length === 0) {
        unresolved.push({ spec, id });
        continue;
      }
      for (const route of routes) {
        const roots = routeFiles(appDir, route);
        if (roots.length === 0) {
          failures.push({ spec, id, route, reason: 'route has no page' });
        } else if (!reaches({ roots, webDir, emitters })) {
          failures.push({
            spec,
            id,
            route,
            reason: `no page, layout or imported component on ${route} renders ${emitters
              .flatMap(e => e.names)
              .join('/')}`,
          });
        }
      }
    }
  }
  return { failures, unresolved };
}

export function main({ root = DEFAULT_ROOT, log = console.log } = {}) {
  const { failures, unresolved } = checkLayoutGuardContracts({ root });
  for (const u of unresolved)
    log(
      `note: ${u.spec} locates ${u.id}; no source emitter found (not checked)`
    );
  for (const f of failures)
    log(
      `layout-guard contract: ${f.spec} visits ${f.route} and locates data-pen-contract="${f.id}", but ${f.reason}. ` +
        'Retarget the spec route to a page that still renders it (keep its assertions) in the same PR.'
    );
  if (failures.length === 0) log('layout-guard pen contracts: all rendered');
  return failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
