#!/usr/bin/env node
/**
 * JOV-INV-031: latency-sensitive-execution-v1 hard-gate.
 *
 * Check class: thread-blocking
 * Rejects known synchronous I/O and expensive sync crypto that block the
 * Node.js event loop (and any browser thread they leak onto). Aliases,
 * namespace members, and thin wrappers are followed so moving a call out of
 * generateMetadata into getProfile() — or wrapping it in `async` — is zero
 * escape.
 *
 * Check class: route-response-latency is a separate sibling.
 * TTFB/FCP/LCP/INP/TBT numbers live only in performance-invariants-v1
 * sources. This gate invents none. Making metadata async does not change
 * crawler/bot wait latency; do not claim that it does.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { readInvariantRegistry } from './registry.mjs';

export const LATENCY_SENSITIVE_INVARIANT_ID = 'JOV-INV-031';
export const LATENCY_SENSITIVE_SCHEMA = 'jovie-latency-sensitive-execution/v1';
export const LATENCY_SENSITIVE_SLUG =
  'jovie/coordination/latency-sensitive-execution-v1';
export const LATENCY_SENSITIVE_CHECK_CLASS = 'thread-blocking';
export const ROUTE_LATENCY_CHECK_CLASS = 'route-response-latency';
export const ROUTE_LATENCY_CONTRACT =
  'docs/performance/performance-invariants-v1.md';
export const ALLOWLIST_PATH =
  'scripts/invariants/latency-sensitive-execution-allowlist.json';
export const ALLOWLIST_SCHEMA =
  'jovie-latency-sensitive-execution-allowlist/v1';
export const ESLINT_CONFIG_PATH = 'apps/web/eslint.config.js';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const RUNTIME_ROOTS = Object.freeze([
  'apps/web/app',
  'apps/web/lib',
  'apps/web/components',
  'apps/web/hooks',
  'apps/web/middleware.ts',
  'apps/web/proxy.ts',
  'apps/desktop/src',
  'packages/ui',
  'packages/auth-routing',
  'packages/audio-contracts',
  'packages/extension-contracts',
  'packages/agent-transport-contracts',
]);

export const DESKTOP_ENTRY_POINTS = Object.freeze([
  'apps/desktop/src/main.ts',
  'apps/desktop/src/preload.ts',
]);

export const WORKER_ALLOWLIST_PREFIXES = Object.freeze(['workers/']);

const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.next',
  'coverage',
  'scripts',
  'tests',
  '__tests__',
  'e2e',
  'storybook-static',
  'generated',
]);

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const FS_SOURCES = new Set(['fs', 'node:fs']);
const CHILD_SOURCES = new Set(['child_process', 'node:child_process']);
const ZLIB_SOURCES = new Set(['zlib', 'node:zlib']);
const CRYPTO_SOURCES = new Set(['crypto', 'node:crypto']);
const BLOCKING_SOURCES = new Set([
  ...FS_SOURCES,
  ...CHILD_SOURCES,
  ...ZLIB_SOURCES,
  ...CRYPTO_SOURCES,
]);

export const FS_FORBIDDEN = Object.freeze([
  'readFileSync',
  'writeFileSync',
  'readdirSync',
]);
export const FS_GRAY = Object.freeze(['existsSync']);
export const CHILD_FORBIDDEN = Object.freeze([
  'execSync',
  'spawnSync',
  'execFileSync',
]);
export const ZLIB_FORBIDDEN = Object.freeze([
  'gzipSync',
  'gunzipSync',
  'deflateSync',
  'inflateSync',
  'unzipSync',
  'brotliCompressSync',
  'brotliDecompressSync',
  'deflateRawSync',
  'inflateRawSync',
]);
export const CRYPTO_FORBIDDEN = Object.freeze([
  'pbkdf2Sync',
  'scryptSync',
  'randomFillSync',
]);

/** @type {Array<[string, Set<string>]>} */
const forbiddenEntries = [];
for (const source of FS_SOURCES)
  forbiddenEntries.push([source, new Set(FS_FORBIDDEN)]);
for (const source of CHILD_SOURCES)
  forbiddenEntries.push([source, new Set(CHILD_FORBIDDEN)]);
for (const source of ZLIB_SOURCES)
  forbiddenEntries.push([source, new Set(ZLIB_FORBIDDEN)]);
for (const source of CRYPTO_SOURCES)
  forbiddenEntries.push([source, new Set(CRYPTO_FORBIDDEN)]);
const FORBIDDEN_BY_SOURCE = new Map(forbiddenEntries);

/** @type {Array<[string, Set<string>]>} */
const grayEntries = [];
for (const source of FS_SOURCES) grayEntries.push([source, new Set(FS_GRAY)]);
const GRAY_BY_SOURCE = new Map(grayEntries);

const ALL_FORBIDDEN = new Set([
  ...FS_FORBIDDEN,
  ...CHILD_FORBIDDEN,
  ...ZLIB_FORBIDDEN,
  ...CRYPTO_FORBIDDEN,
]);
const ALL_GRAY = new Set(FS_GRAY);
const ALL_TRACKED = new Set([...ALL_FORBIDDEN, ...ALL_GRAY]);

const FORBIDDEN_NAME_RE = `^(${[...ALL_FORBIDDEN].join('|')})$`;

export const ESLINT_RESTRICTED_SYNTAX = Object.freeze([
  {
    selector: `CallExpression[callee.name=/${FORBIDDEN_NAME_RE}/]`,
    message:
      'JOV-INV-031 thread-blocking: known sync I/O/crypto blocks the event loop. Use nonblocking I/O or precompute. This is not a route-response-latency budget and does not change crawler/bot wait.',
  },
  {
    selector: `CallExpression[callee.property.name=/${FORBIDDEN_NAME_RE}/]`,
    message:
      'JOV-INV-031 thread-blocking: known sync I/O/crypto blocks the event loop. Aliases and members are the same violation. This is not a route-response-latency budget.',
  },
  {
    selector: `ImportSpecifier[imported.name=/${FORBIDDEN_NAME_RE}/]`,
    message:
      'JOV-INV-031 thread-blocking: importing a known sync I/O/crypto API is rejected in runtime app code, including aliases. Moving the call into a helper is zero escape.',
  },
]);

function posixRel(repoRoot, absPath) {
  return relative(repoRoot, absPath).split('\\').join('/');
}

function sourceKind(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.ts') || filePath.endsWith('.mts')) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.JS;
}

function extname(filePath) {
  const base = filePath.split('/').pop() ?? filePath;
  const index = base.lastIndexOf('.');
  return index >= 0 ? base.slice(index) : '';
}

function isTestOrGeneratedPath(posix) {
  if (/\.(test|spec|stories)\./.test(posix)) return true;
  const parts = posix.split('/');
  return parts.some(
    part =>
      part === 'node_modules' ||
      part === 'dist' ||
      part === '.next' ||
      part === 'coverage' ||
      part === 'generated' ||
      part === 'storybook-static'
  );
}

export function isRuntimeSourcePath(relPath) {
  const posix = relPath.split('\\').join('/');
  if (WORKER_ALLOWLIST_PREFIXES.some(prefix => posix.startsWith(prefix))) {
    return false;
  }
  if (/\.(test|spec|stories)\./.test(posix)) return false;
  const parts = posix.split('/');
  if (parts.some(part => EXCLUDED_DIR_NAMES.has(part))) return false;
  if (!SOURCE_EXT.has(extname(posix))) return false;
  return RUNTIME_ROOTS.some(root => {
    if (posix === root) return true;
    if (root.endsWith('.ts') || root.endsWith('.js')) return posix === root;
    return posix === root || posix.startsWith(`${root}/`);
  });
}

/**
 * Files imported by a runtime entry stay in-scope even when they live under
 * `workers/` or outside RUNTIME_ROOTS. Isolated workers and build scripts
 * remain excluded unless a main-thread module imports them.
 */
export function isReachableRuntimeSourcePath(relPath) {
  const posix = relPath.split('\\').join('/');
  if (isTestOrGeneratedPath(posix)) return false;
  return SOURCE_EXT.has(extname(posix));
}

function collectRelativeImportSpecifiers(sourceText, relPath) {
  const script = ts.createSourceFile(
    relPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourceKind(relPath)
  );
  /** @type {string[]} */
  const specifiers = [];

  function maybeAdd(node, spec) {
    if (!spec || !spec.startsWith('.')) return;
    if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) {
      return;
    }
    if (ts.isExportDeclaration(node) && node.isTypeOnly) return;
    specifiers.push(spec);
  }

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      maybeAdd(node, literalString(node.moduleSpecifier));
    }
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression;
      const isRequire =
        (ts.isIdentifier(callee) && callee.text === 'require') ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === 'require');
      const isImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      if (isRequire || isImport) {
        const spec = literalString(node.arguments[0]);
        if (spec?.startsWith('.')) specifiers.push(spec);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(script);
  return specifiers;
}

function resolveRelativeImport(fromRel, specifier, repoRoot, files) {
  if (!specifier.startsWith('.')) return null;
  const inMemory = Object.keys(files).length > 0;
  const fromAbs = resolve(repoRoot, fromRel);
  const target = resolve(dirname(fromAbs), specifier);
  /** @type {string[]} */
  const candidates = [posixRel(repoRoot, target)];
  const add = abs => {
    const rel = posixRel(repoRoot, abs);
    if (!candidates.includes(rel)) candidates.push(rel);
  };

  if (!extname(target)) {
    for (const ext of SOURCE_EXT) add(`${target}${ext}`);
    for (const ext of SOURCE_EXT) add(join(target, `index${ext}`));
  } else if (/\.(js|mjs|cjs)$/.test(target)) {
    add(target.replace(/\.(js|mjs|cjs)$/, '.ts'));
    add(target.replace(/\.(js|mjs|cjs)$/, '.tsx'));
  }

  for (const candidate of candidates) {
    if (inMemory) {
      if (Object.hasOwn(files, candidate)) return candidate;
      continue;
    }
    if (existsSync(resolve(repoRoot, candidate))) return candidate;
  }
  return null;
}

function readSourceText(relPath, repoRoot, files) {
  if (Object.hasOwn(files, relPath)) return files[relPath];
  const abs = resolve(repoRoot, relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

export function collectReachableRuntimeFiles(
  seedPaths,
  repoRoot = DEFAULT_ROOT,
  files = {}
) {
  const reachable = new Set(
    seedPaths.map(path => path.split('\\').join('/')).filter(Boolean)
  );
  const queue = [...reachable];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    const source = readSourceText(current, repoRoot, files);
    if (source == null) continue;
    for (const spec of collectRelativeImportSpecifiers(source, current)) {
      const resolved = resolveRelativeImport(current, spec, repoRoot, files);
      if (!resolved || !isReachableRuntimeSourcePath(resolved)) continue;
      if (reachable.has(resolved)) continue;
      reachable.add(resolved);
      queue.push(resolved);
    }
  }
  return [...reachable].sort();
}

function walkFiles(absDir, files) {
  if (!existsSync(absDir)) return;
  const stat = ts.sys.directoryExists(absDir)
    ? 'dir'
    : ts.sys.fileExists(absDir)
      ? 'file'
      : null;
  if (stat === 'file') {
    files.push(absDir);
    return;
  }
  if (stat !== 'dir') return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (entry.isDirectory() && EXCLUDED_DIR_NAMES.has(entry.name)) continue;
    const next = join(absDir, entry.name);
    if (entry.isDirectory()) walkFiles(next, files);
    else files.push(next);
  }
}

function literalString(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function trackedName(specifier, name) {
  if (!name) return null;
  if (FORBIDDEN_BY_SOURCE.get(specifier)?.has(name)) return name;
  if (GRAY_BY_SOURCE.get(specifier)?.has(name)) return name;
  if (!specifier && ALL_TRACKED.has(name)) return name;
  return null;
}

function requireSpecifier(node) {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  const isRequire =
    (ts.isIdentifier(callee) && callee.text === 'require') ||
    (ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'require');
  if (!isRequire || node.arguments.length === 0) return null;
  const spec = literalString(node.arguments[0]);
  return spec && BLOCKING_SOURCES.has(spec) ? spec : null;
}

function importCallSpecifier(node) {
  if (!ts.isCallExpression(node)) return null;
  if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) return null;
  if (node.arguments.length === 0) return null;
  const spec = literalString(node.arguments[0]);
  return spec && BLOCKING_SOURCES.has(spec) ? spec : null;
}

/**
 * Scan one source file. Returns thread-blocking findings, including aliases
 * and wrappers. existsSync is gray: module top-level is allowed (config once);
 * a call inside a function in runtime code is a violation.
 */
export function scanSource(relPath, sourceText) {
  const script = ts.createSourceFile(
    relPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourceKind(relPath)
  );

  /** @type {Map<string, string>} name -> tracked callee */
  const aliases = new Map();
  /** @type {Set<string>} */
  const namespaces = new Set();
  const findings = [];

  function bindAlias(name, callee) {
    if (name && callee) aliases.set(name, callee);
  }

  function bindNamespace(name) {
    if (name) namespaces.add(name);
  }

  function bindBindingName(nameNode, specifier) {
    if (!nameNode) return;
    if (ts.isIdentifier(nameNode)) {
      bindNamespace(nameNode.text);
      return;
    }
    if (!ts.isObjectBindingPattern(nameNode)) return;
    for (const element of nameNode.elements) {
      if (!ts.isBindingElement(element) || !ts.isIdentifier(element.name)) {
        continue;
      }
      const imported = element.propertyName
        ? ts.isIdentifier(element.propertyName)
          ? element.propertyName.text
          : null
        : element.name.text;
      const tracked = trackedName(specifier, imported);
      if (tracked) bindAlias(element.name.text, tracked);
    }
  }

  function calleeName(expr) {
    if (!expr) return null;
    if (ts.isParenthesizedExpression(expr)) return calleeName(expr.expression);
    if (ts.isAsExpression(expr)) return calleeName(expr.expression);
    if (
      typeof ts.isTypeAssertionExpression === 'function' &&
      ts.isTypeAssertionExpression(expr)
    ) {
      return calleeName(expr.expression);
    }
    if (ts.isNonNullExpression(expr)) return calleeName(expr.expression);
    if (ts.isConditionalExpression(expr)) {
      return calleeName(expr.whenTrue) ?? calleeName(expr.whenFalse);
    }
    if (ts.isIdentifier(expr)) {
      if (aliases.has(expr.text)) return aliases.get(expr.text);
      if (ALL_TRACKED.has(expr.text)) return expr.text;
      return null;
    }
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
      const prop = expr.name.text;
      if (!ALL_TRACKED.has(prop)) return null;
      return prop;
    }
    if (
      ts.isElementAccessExpression(expr) &&
      literalString(expr.argumentExpression)
    ) {
      const prop = literalString(expr.argumentExpression);
      return ALL_TRACKED.has(prop) ? prop : null;
    }
    return null;
  }

  function bindInitializer(nameNode, initializer) {
    if (!initializer) return;
    const spec =
      requireSpecifier(initializer) ?? importCallSpecifier(initializer);
    if (spec) {
      bindBindingName(nameNode, spec);
      if (ts.isIdentifier(nameNode)) bindNamespace(nameNode.text);
      return;
    }
    if (ts.isIdentifier(nameNode)) {
      const aliased = calleeName(initializer);
      if (aliased) bindAlias(nameNode.text, aliased);
    }
  }

  function visit(node, fnDepth) {
    const nextDepth = fnDepth + (isFunctionLike(node) ? 1 : 0);

    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      const spec = literalString(node.moduleSpecifier);
      if (spec && BLOCKING_SOURCES.has(spec) && node.importClause) {
        if (node.importClause.name) bindNamespace(node.importClause.name.text);
        const bindings = node.importClause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          bindNamespace(bindings.name.text);
        }
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const imported = element.propertyName
              ? element.propertyName.text
              : element.name.text;
            const tracked = trackedName(spec, imported);
            if (tracked) bindAlias(element.name.text, tracked);
          }
        }
      }
    }

    if (ts.isVariableDeclaration(node)) {
      bindInitializer(node.name, node.initializer);
    }

    if (ts.isParameter(node) && node.initializer) {
      bindInitializer(node.name, node.initializer);
    }

    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (name) {
        const gray = ALL_GRAY.has(name);
        if (!gray || nextDepth > 0) {
          const { line } = script.getLineAndCharacterOfPosition(
            node.getStart(script)
          );
          findings.push({
            path: relPath,
            line: line + 1,
            callee: name,
            checkClass: LATENCY_SENSITIVE_CHECK_CLASS,
            gray,
            wrappedInAsync:
              ts.isFunctionDeclaration(node.parent) ||
              ts.isFunctionExpression(node.parent) ||
              ts.isArrowFunction(node.parent)
                ? Boolean(
                    node.parent.modifiers?.some(
                      modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword
                    )
                  ) ||
                  Boolean(
                    node.parent.kind === ts.SyntaxKind.ArrowFunction &&
                      node.parent.modifiers
                  )
                : false,
          });
        }
      }
    }

    ts.forEachChild(node, child => visit(child, nextDepth));
  }

  visit(script, 0);
  return findings;
}

function countByFile(findings) {
  /** @type {Record<string, Record<string, number>>} */
  const counts = {};
  for (const finding of findings) {
    counts[finding.path] ??= {};
    counts[finding.path][finding.callee] =
      (counts[finding.path][finding.callee] ?? 0) + 1;
  }
  return counts;
}

export function collectRuntimeFiles(repoRoot = DEFAULT_ROOT, files = {}) {
  const inMemory = Object.keys(files).length > 0;
  const seeded = inMemory
    ? Object.keys(files).filter(relPath => {
        const posix = relPath.split('\\').join('/');
        return (
          isRuntimeSourcePath(posix) || DESKTOP_ENTRY_POINTS.includes(posix)
        );
      })
    : (() => {
        const absFiles = [];
        for (const root of RUNTIME_ROOTS) {
          walkFiles(resolve(repoRoot, root), absFiles);
        }
        return absFiles
          .map(abs => posixRel(repoRoot, abs))
          .filter(isRuntimeSourcePath);
      })();
  return collectReachableRuntimeFiles(seeded, repoRoot, files);
}

export function scanRuntime(repoRoot = DEFAULT_ROOT, files = {}) {
  const findings = [];
  for (const relPath of collectRuntimeFiles(repoRoot, files)) {
    const source =
      files[relPath] ??
      (existsSync(resolve(repoRoot, relPath))
        ? readFileSync(resolve(repoRoot, relPath), 'utf8')
        : null);
    if (source == null) continue;
    findings.push(...scanSource(relPath, source));
  }
  return findings;
}

export function loadAllowlist(repoRoot = DEFAULT_ROOT, files = {}) {
  const raw =
    files[ALLOWLIST_PATH] ??
    readFileSync(resolve(repoRoot, ALLOWLIST_PATH), 'utf8');
  return JSON.parse(raw);
}

export function projectAllowlist(findings) {
  return {
    schema: ALLOWLIST_SCHEMA,
    checkClass: LATENCY_SENSITIVE_CHECK_CLASS,
    siblingCheckClass: ROUTE_LATENCY_CHECK_CLASS,
    note: 'Existing request-path thread-blocking calls. Counts may only decrease. Not a route-response-latency budget.',
    entries: countByFile(findings),
  };
}

export function diffAllowlist(actual, allowed) {
  const errors = [];
  const actualEntries = actual.entries ?? {};
  const allowedEntries = allowed?.entries ?? {};
  const files = new Set([
    ...Object.keys(actualEntries),
    ...Object.keys(allowedEntries),
  ]);
  for (const file of [...files].sort()) {
    const got = actualEntries[file] ?? {};
    const want = allowedEntries[file] ?? {};
    const callees = new Set([...Object.keys(got), ...Object.keys(want)]);
    for (const callee of [...callees].sort()) {
      const actualCount = got[callee] ?? 0;
      const allowedCount = want[callee] ?? 0;
      if (actualCount > allowedCount) {
        errors.push(
          `thread-blocking new: ${file} ${callee} count ${actualCount} exceeds allowlist ${allowedCount}`
        );
      } else if (actualCount < allowedCount) {
        errors.push(
          `thread-blocking stale-allowlist: ${file} ${callee} count ${actualCount} < allowlist ${allowedCount}; shrink the allowlist`
        );
      }
    }
  }
  return errors;
}

function eslintSource(repoRoot, files = {}) {
  return (
    files[ESLINT_CONFIG_PATH] ??
    (existsSync(resolve(repoRoot, ESLINT_CONFIG_PATH))
      ? readFileSync(resolve(repoRoot, ESLINT_CONFIG_PATH), 'utf8')
      : '')
  );
}

export function validateEslintSelectors(repoRoot = DEFAULT_ROOT, files = {}) {
  const source = eslintSource(repoRoot, files);
  const errors = [];
  if (!source.includes("'no-restricted-syntax'")) {
    errors.push('eslint.config.js must keep no-restricted-syntax');
  }
  for (const callee of ALL_FORBIDDEN) {
    if (!source.includes(callee)) {
      errors.push(
        `eslint.config.js no-restricted-syntax must name ${callee} for author-time thread-blocking`
      );
    }
  }
  if (!source.includes(LATENCY_SENSITIVE_INVARIANT_ID)) {
    errors.push('eslint.config.js must bind JOV-INV-031');
  }
  if (
    !source.includes(LATENCY_SENSITIVE_CHECK_CLASS) ||
    !source.includes(ROUTE_LATENCY_CHECK_CLASS)
  ) {
    errors.push(
      'eslint.config.js must keep thread-blocking distinct from route-response-latency'
    );
  }
  return errors;
}

export function validateLatencySensitiveContract(
  registry,
  repoRoot = DEFAULT_ROOT,
  files = {}
) {
  const invariant = registry?.invariants?.find(
    item => item.id === LATENCY_SENSITIVE_INVARIANT_ID
  );
  if (!invariant) {
    return [`${LATENCY_SENSITIVE_INVARIANT_ID} is missing from the registry`];
  }
  const policy = invariant.policy?.value ?? {};
  const errors = [];
  if (policy.schema !== LATENCY_SENSITIVE_SCHEMA) {
    errors.push(`policy schema must be ${LATENCY_SENSITIVE_SCHEMA}`);
  }
  if (policy.gbrainSlug !== LATENCY_SENSITIVE_SLUG) {
    errors.push(`gbrain slug must be ${LATENCY_SENSITIVE_SLUG}`);
  }
  if (policy.checkClass !== LATENCY_SENSITIVE_CHECK_CLASS) {
    errors.push(`checkClass must be ${LATENCY_SENSITIVE_CHECK_CLASS}`);
  }
  if (policy.siblingCheckClass !== ROUTE_LATENCY_CHECK_CLASS) {
    errors.push(
      `siblingCheckClass must stay ${ROUTE_LATENCY_CHECK_CLASS} and must not be merged into thread-blocking`
    );
  }
  if (policy.siblingContract !== ROUTE_LATENCY_CONTRACT) {
    errors.push(`sibling contract must be ${ROUTE_LATENCY_CONTRACT}`);
  }
  if (policy.inventBudgets !== false) {
    errors.push('must refuse invented route-latency budget numbers');
  }
  if (policy.checkClass === policy.siblingCheckClass) {
    errors.push(
      'thread-blocking and route-response-latency must stay distinct'
    );
  }
  return errors;
}

export function validateLatencySensitiveExecution(
  repoRoot = DEFAULT_ROOT,
  { files = {}, registry = readInvariantRegistry(repoRoot) } = {}
) {
  const findings = scanRuntime(repoRoot, files);
  const allowlist = loadAllowlist(repoRoot, files);
  if (allowlist.schema !== ALLOWLIST_SCHEMA) {
    return [`allowlist schema must be ${ALLOWLIST_SCHEMA}`];
  }
  if (allowlist.checkClass !== LATENCY_SENSITIVE_CHECK_CLASS) {
    return ['allowlist must be the thread-blocking check class'];
  }
  return [
    ...validateLatencySensitiveContract(registry, repoRoot, files),
    ...validateEslintSelectors(repoRoot, files),
    ...diffAllowlist(projectAllowlist(findings), allowlist),
  ];
}

export const FIXTURE_ROOT =
  'scripts/invariants/fixtures/latency-sensitive-execution';

export function scanFixture(name, repoRoot = DEFAULT_ROOT) {
  return scanRuntime(resolve(repoRoot, FIXTURE_ROOT, name));
}

export function writeAllowlist(repoRoot = DEFAULT_ROOT, files = {}) {
  const pack = projectAllowlist(scanRuntime(repoRoot, files));
  writeFileSync(
    resolve(repoRoot, ALLOWLIST_PATH),
    `${JSON.stringify(pack, null, 2)}\n`
  );
  return pack;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = DEFAULT_ROOT;
  if (process.argv.includes('--write-allowlist')) {
    const pack = writeAllowlist(repoRoot);
    process.stdout.write(
      `Wrote ${ALLOWLIST_PATH} (${Object.keys(pack.entries).length} files)\n`
    );
  } else {
    const errors = validateLatencySensitiveExecution(repoRoot);
    if (errors.length) {
      for (const error of errors) process.stderr.write(`${error}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(
        'latency-sensitive-execution-v1 thread-blocking gate clean\n'
      );
    }
  }
}
