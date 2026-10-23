// Diff-scoped mutation testing for high-risk apps/web source.
//
// Stryker's vitest runner (10.0.0) loses results for tests nested in
// `describe` blocks under vitest 5, so every killed mutant there scores as
// Survived. This lane uses Stryker's command runner instead: each mutant runs
// a plain `vitest run` over the tests that import the mutated file.

import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import ts from 'typescript';

export const WEB_ROOT = 'apps/web';

/** apps/web-relative prefixes where a weak test costs money, access, or trust. */
export const HIGH_RISK_PREFIXES = Object.freeze([
  'app/api/billing/',
  'app/api/stripe/',
  'app/api/webhooks/',
  'lib/auth/',
  'lib/billing/',
  'lib/claim/',
  'lib/cron/auth.ts',
  'lib/entitlements/',
  'lib/idempotency.ts',
  'lib/stripe/',
  'proxy.ts',
]);

const SOURCE_EXTENSION = /\.(?:ts|tsx)$/u;
const NON_SOURCE =
  /(?:\.test\.|\.spec\.|\.stories\.|\.d\.ts$|\/__tests__\/|\/__mocks__\/)/u;
const TEST_FILE = /\.test\.(?:ts|tsx)$/u;
const SKIPPED_TEST_DIRS = new Set([
  '.next',
  '.stryker-tmp',
  'node_modules',
  'coverage',
  'reports',
]);
// Mirrors the slow suites vitest.config.fast.mts excludes.
const SKIPPED_TEST_PATHS =
  /^tests\/(?:e2e|eval|audit|performance|integration|docs-guides|product-screenshots|visual-qa)\//u;
const MODULE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
];
const ALIASES = Object.freeze([
  ['@/app/(shell)/', 'app/app/(shell)/'],
  ['@/features/', 'components/features/'],
  ['@/', ''],
]);

/**
 * Pick the changed files this lane mutates.
 * @param {string[]} changedPaths repo-relative paths
 * @param {(path: string) => string | null} [readModule] apps/web-relative reader
 * @returns {string[]} apps/web-relative source paths
 */
export function selectHighRiskSources(changedPaths, readModule) {
  const selected = new Set();
  for (const path of changedPaths) {
    if (!path.startsWith(`${WEB_ROOT}/`)) continue;
    const webPath = path.slice(WEB_ROOT.length + 1);
    if (!SOURCE_EXTENSION.test(webPath) || NON_SOURCE.test(webPath)) continue;
    if (HIGH_RISK_PREFIXES.some(prefix => webPath.startsWith(prefix))) {
      const contents = readModule?.(webPath);
      if (typeof contents === 'string' && !hasRuntimeSource(webPath, contents))
        continue;
      selected.add(webPath);
    }
  }
  return [...selected].sort();
}

/**
 * Resolve an import specifier from a test file to an extensionless
 * apps/web-relative module path, or null when it leaves the app.
 * @param {string} specifier
 * @param {string} testPath apps/web-relative
 */
export function resolveSpecifier(specifier, testPath) {
  for (const [alias, target] of ALIASES) {
    if (specifier.startsWith(alias)) {
      const resolved = posix.normalize(target + specifier.slice(alias.length));
      return resolved.startsWith('..') ? null : stripModuleSuffix(resolved);
    }
  }
  if (!specifier.startsWith('.')) return null;
  const resolved = posix.normalize(
    posix.join(posix.dirname(testPath), specifier)
  );
  return resolved.startsWith('..') ? null : stripModuleSuffix(resolved);
}

/** @param {string} path */
function stripModuleSuffix(path) {
  return path.replace(/\.(?:[cm]?[jt]sx?)$/u, '');
}

/**
 * Parse source with the pinned compiler, rejecting incomplete parser evidence.
 * @param {string} path
 * @param {string} contents
 */
function parseModule(path, contents) {
  const tree = ts.createSourceFile(
    path,
    contents,
    ts.ScriptTarget.Latest,
    true
  );
  // The pinned compiler exposes this parser result at runtime, but omits it
  // from SourceFile's public type. Fail closed if that runtime shape changes.
  const diagnostics =
    /** @type {ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }} */ (
      tree
    ).parseDiagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.length > 0) {
    throw new Error(`Cannot parse mutation import graph: ${path}`);
  }
  return tree;
}

/**
 * Skip only source proven to contain erased TypeScript declarations. Unknown,
 * missing, or malformed source remains selected and fails the normal harness.
 * Inline type specifiers can retain import side effects, so stay selected.
 * @param {string} path
 * @param {string} contents
 */
function hasRuntimeSource(path, contents) {
  let tree;
  try {
    tree = parseModule(path, contents);
  } catch {
    return true;
  }
  return tree.statements.some(statement => {
    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEmptyStatement(statement) ||
      ((ts.isVariableStatement(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
        ts
          .getModifiers(statement)
          ?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword))
    )
      return false;
    if (ts.isImportDeclaration(statement))
      return !statement.importClause?.isTypeOnly;
    if (ts.isImportEqualsDeclaration(statement)) return !statement.isTypeOnly;
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      return !(
        statement.isTypeOnly ||
        (!statement.moduleSpecifier &&
          clause &&
          ts.isNamedExports(clause) &&
          clause.elements.length === 0)
      );
    }
    return true;
  });
}

/**
 * Parse runtime module edges, never comments, strings, or type-only imports.
 * Mock barriers apply per test; importActual/importOriginal load real code.
 * @param {string} path
 * @param {string} contents
 */
function runtimeImports(path, contents) {
  const tree = parseModule(path, contents);
  /** @type {{ specifier: string, actual: boolean }[]} */
  const imports = [];
  /** @type {string[]} */
  const mocks = [];
  /** @type {string[]} */
  const unmocks = [];
  /** @param {ts.Node | undefined} node */
  const literal = node => {
    if (node && ts.isStringLiteralLike(node)) return node.text;
    if (
      node &&
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) return arg.text;
    }
    return null;
  };
  /** @param {ts.Expression} expression */
  const viMethod = expression =>
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    ['vi', 'vitest'].includes(expression.expression.text)
      ? expression.name.text
      : null;
  /** @param {ts.Node} node */
  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const allTypeOnly =
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every(item => item.isTypeOnly);
      if (!clause?.isTypeOnly && !(allTypeOnly && !clause?.name)) {
        const specifier = literal(node.moduleSpecifier);
        if (specifier) imports.push({ specifier, actual: false });
      }
      return;
    }
    if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause;
      const allTypeOnly =
        clause &&
        ts.isNamedExports(clause) &&
        clause.elements.length > 0 &&
        clause.elements.every(item => item.isTypeOnly);
      const specifier = literal(node.moduleSpecifier);
      if (!node.isTypeOnly && !allTypeOnly && specifier) {
        imports.push({ specifier, actual: false });
      }
      return;
    }
    if (ts.isImportEqualsDeclaration(node)) {
      if (
        !node.isTypeOnly &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        const specifier = literal(node.moduleReference.expression);
        if (specifier) imports.push({ specifier, actual: false });
      }
      return;
    }
    if (ts.isCallExpression(node)) {
      const method = viMethod(node.expression);
      if (method === 'unmock') {
        const specifier = literal(node.arguments[0]);
        if (specifier) unmocks.push(specifier);
        return;
      }
      if (method === 'mock' || method === 'doMock') {
        const specifier = literal(node.arguments[0]);
        const factory = node.arguments[1];
        const spy =
          factory &&
          ts.isObjectLiteralExpression(factory) &&
          factory.properties.some(
            property =>
              ts.isPropertyAssignment(property) &&
              (ts.isIdentifier(property.name) ||
                ts.isStringLiteralLike(property.name)) &&
              property.name.text === 'spy' &&
              property.initializer.kind === ts.SyntaxKind.TrueKeyword
          );
        // doMock is not hoisted: a preceding static import still runs real code.
        // Spy mocks retain the original implementation. Unknown temporal/helper
        // mocking is conservatively selected, then checked by V8 preflight.
        if (specifier && method === 'mock' && factory && !spy)
          mocks.push(specifier);
        if (
          specifier &&
          factory &&
          (ts.isArrowFunction(factory) || ts.isFunctionExpression(factory))
        ) {
          const parameter = factory.parameters[0]?.name;
          if (parameter && ts.isIdentifier(parameter)) {
            /** @param {ts.Node} child */
            const findOriginal = child => {
              if (
                ts.isCallExpression(child) &&
                ts.isIdentifier(child.expression) &&
                child.expression.text === parameter.text
              ) {
                imports.push({ specifier, actual: true });
              }
              ts.forEachChild(child, findOriginal);
            };
            findOriginal(factory.body);
          }
        }
        // import('./module') used as vi.mock's first argument is a mock target.
        // Visit only the factory, which may explicitly import actual code.
        if (factory) visit(factory);
        return;
      }
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        isRequire ||
        method === 'importActual'
      ) {
        const specifier = literal(node.arguments[0]);
        if (specifier)
          imports.push({ specifier, actual: method === 'importActual' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { imports, mocks, unmocks };
}

/**
 * Cache the runtime import graph once for all changed files. Traversal stays
 * within apps/web and follows local aliases, relative imports and re-exports.
 * Nearest runtime paths rank first, then dedicated suites at the same depth.
 * This selects candidate tests; Stryker still measures their effectiveness.
 * @param {Map<string, string>} testSources
 * @param {(path: string) => string | null} [readModule]
 */
export function createTestSelector(
  testSources,
  readModule = path => testSources.get(path) ?? null
) {
  /** @type {Map<string, ReturnType<typeof runtimeImports> | null>} */
  const parsed = new Map();
  /** @param {string} path */
  const module = path => {
    if (!parsed.has(path)) {
      const contents = testSources.get(path) ?? readModule(path);
      parsed.set(
        path,
        contents === null ? null : runtimeImports(path, contents)
      );
    }
    return parsed.get(path) ?? null;
  };
  /** @param {string} specifier @param {string} importer */
  const resolveModule = (specifier, importer) => {
    const stem = resolveSpecifier(specifier, importer);
    if (stem === null) return null;
    const explicitExtension = MODULE_EXTENSIONS.find(extension =>
      specifier.endsWith(extension)
    );
    for (const candidate of [
      ...(explicitExtension ? [`${stem}${explicitExtension}`] : []),
      ...MODULE_EXTENSIONS.map(extension => `${stem}${extension}`),
      ...MODULE_EXTENSIONS.map(extension => `${stem}/index${extension}`),
    ]) {
      if (module(candidate)) return candidate;
    }
    return null;
  };
  /** @param {string} sourcePath */
  return sourcePath => {
    if (!module(sourcePath))
      throw new Error(`Mutation source is missing: ${sourcePath}`);
    const related = [];
    for (const testPath of testSources.keys()) {
      const test = module(testPath);
      const unmocked = new Set(
        test?.unmocks.map(specifier => resolveModule(specifier, testPath))
      );
      const mocked = new Set(
        test?.mocks
          .map(specifier => resolveModule(specifier, testPath))
          .filter(path => !unmocked.has(path))
      );
      const visited = new Set();
      const pending = [{ path: testPath, distance: 0 }];
      for (let index = 0; index < pending.length; index++) {
        const current = pending[index];
        if (visited.has(current.path)) continue;
        visited.add(current.path);
        if (current.path === sourcePath) {
          related.push({ path: testPath, distance: current.distance });
          break;
        }
        for (const edge of module(current.path)?.imports ?? []) {
          const target = resolveModule(edge.specifier, current.path);
          if (!target || (mocked.has(target) && !edge.actual)) continue;
          pending.push({ path: target, distance: current.distance + 1 });
        }
      }
    }
    const stem = posix.basename(stripModuleSuffix(sourcePath));
    const dedicated = path => (posix.basename(path).startsWith(stem) ? 0 : 1);
    return related
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          dedicated(a.path) - dedicated(b.path) ||
          a.path.localeCompare(b.path)
      )
      .map(test => test.path);
  };
}

/**
 * Compatibility helper for in-memory graph fixtures.
 * @param {string} sourcePath
 * @param {Map<string, string>} testSources
 * @param {Map<string, string>} [moduleSources]
 */
export function findRelatedTests(
  sourcePath,
  testSources,
  moduleSources = new Map()
) {
  return createTestSelector(
    testSources,
    path => moduleSources.get(path) ?? null
  )(sourcePath);
}

/** @param {string} webRoot */
export function readModuleSource(webRoot) {
  /** @param {string} path */
  return path => {
    const absolute = join(webRoot, path);
    return existsSync(absolute) && statSync(absolute).isFile()
      ? readFileSync(absolute, 'utf8')
      : null;
  };
}

/**
 * @param {string} webRoot absolute path to apps/web
 * @returns {Map<string, string>}
 */
export function readTestSources(webRoot) {
  /** @type {Map<string, string>} */
  const tests = new Map();
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_TEST_DIRS.has(entry.name)) continue;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      const webPath = relative(webRoot, absolute).split('\\').join('/');
      if (!TEST_FILE.test(webPath) || SKIPPED_TEST_PATHS.test(webPath)) {
        continue;
      }
      if (webPath.includes('.nightly.test.')) continue;
      tests.set(webPath, readFileSync(absolute, 'utf8'));
    }
  };
  walk(webRoot);
  return tests;
}

/**
 * @typedef {{ status: string, mutatorName: string, replacement?: string,
 *   location: { start: { line: number } } }} Mutant
 * @typedef {{ file: string, tests: string[], mutants: Mutant[], executedTests?: number,
 *   targetExecution?: ReturnType<typeof readTargetExecution> }} FileResult
 */

/** @param {Mutant[]} mutants */
export function scoreMutants(mutants) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const mutant of mutants) {
    counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
  }
  const detected = (counts.Killed ?? 0) + (counts.Timeout ?? 0);
  const undetected = (counts.Survived ?? 0) + (counts.NoCoverage ?? 0);
  const valid = detected + undetected;
  return {
    detected,
    undetected,
    valid,
    score: valid === 0 ? null : Math.round((detected / valid) * 1000) / 10,
  };
}

/**
 * Markdown summary: one row per file, then the first survivors per file.
 * @param {{ sources: string[], results: FileResult[], untested: string[], skipped: string[],
 *   errors?: { file: string, reason: string }[], lowScore: number, survivorsPerFile?: number,
 *   floors?: Record<string, { floor?: number }>,
 *   floorFailures?: { file: string, score: number | null, floor: number }[] }} input
 */
export function renderSummary({
  sources,
  results,
  untested,
  skipped,
  lowScore,
  errors = [],
  survivorsPerFile = 10,
  floors = {},
  floorFailures = [],
}) {
  const lines = ['## Mutation diff', ''];
  if (sources.length === 0) {
    lines.push('Skipped: no applicable changed high-risk source files.');
    return `${lines.join('\n')}\n`;
  }
  lines.push(
    `Selected ${sources.length} high-risk source file(s); completed ${results.length}.`,
    ''
  );
  if (results.length > 0) {
    lines.push(
      '| File | Score | Detected | Survived | Test files | Passed tests | Target statements / functions | Floor |'
    );
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const result of results) {
      const { detected, undetected, score } = scoreMutants(result.mutants);
      const flag = score !== null && score < lowScore ? ' (low)' : '';
      const shown = score === null ? 'n/a' : `${score}%${flag}`;
      const target = result.targetExecution;
      const executed = target
        ? `${target.executedStatements}/${target.totalStatements} / ${target.executedFunctions}/${target.totalFunctions}`
        : 'n/a';
      const floor = floors[result.file]?.floor;
      const floorCell = typeof floor === 'number' ? `${floor}%` : 'n/a';
      lines.push(
        `| \`${result.file}\` | ${shown} | ${detected} | ${undetected} | ${result.tests.length} | ${result.executedTests ?? 'n/a'} | ${executed} | ${floorCell} |`
      );
    }
  }
  if (floorFailures.length > 0) {
    lines.push('', '### Score floor regressions', '');
    for (const failure of floorFailures) {
      const shown = failure.score === null ? 'n/a' : `${failure.score}%`;
      lines.push(
        `- \`${failure.file}\`: ${shown} is below floor ${failure.floor}%`
      );
    }
  }
  for (const result of results) {
    const survivors = result.mutants.filter(
      mutant => mutant.status === 'Survived' || mutant.status === 'NoCoverage'
    );
    if (survivors.length === 0) continue;
    lines.push('', `### Survivors in \`${result.file}\``, '');
    for (const mutant of survivors.slice(0, survivorsPerFile)) {
      const replacement = (mutant.replacement ?? '')
        .replace(/\s+/gu, ' ')
        .slice(0, 80);
      lines.push(
        `- L${mutant.location.start.line} ${mutant.mutatorName} → \`${replacement}\``
      );
    }
    if (survivors.length > survivorsPerFile) {
      lines.push(`- …and ${survivors.length - survivorsPerFile} more`);
    }
  }
  if (untested.length > 0) {
    lines.push('', '### Selection failed: no runtime test import path', '');
    for (const file of untested) lines.push(`- \`${file}\``);
  }
  if (errors.length > 0) {
    lines.push('', '### Harness failures', '');
    for (const error of errors)
      lines.push(`- \`${error.file}\`: ${error.reason}`);
  }
  if (skipped.length > 0) {
    lines.push('', '### Skipped (file cap)', '');
    for (const file of skipped) lines.push(`- \`${file}\``);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {string} reportPath
 * @param {string} sourcePath apps/web-relative
 */
export function readReportMutants(reportPath, sourcePath) {
  if (!existsSync(reportPath)) return null;
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const entry = report.files?.[sourcePath];
  return entry ? /** @type {Mutant[]} */ (entry.mutants) : null;
}

/** A green process alone is insufficient: skipped suites execute zero tests.
 * @param {string} reportPath
 */
export function readExecutedTests(reportPath) {
  if (!existsSync(reportPath))
    throw new Error('Vitest did not write a test receipt');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (report.success !== true || report.numFailedTests !== 0) {
    throw new Error('Vitest baseline failed');
  }
  if (
    !Number.isSafeInteger(report.numPassedTests) ||
    report.numPassedTests < 1
  ) {
    throw new Error('Vitest baseline executed zero passing tests');
  }
  return report.numPassedTests;
}

/** V8 proves target execution, not whether an assertion detects wrong behavior.
 * @param {string} reportPath
 * @param {string} sourcePath absolute source path
 */
export function readTargetExecution(reportPath, sourcePath) {
  if (!existsSync(reportPath))
    throw new Error('V8 did not write a target execution receipt');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const canonical = path =>
    existsSync(path) ? realpathSync(path) : resolve(path);
  const coverage = Object.entries(report).find(
    ([path, file]) => canonical(file.path ?? path) === canonical(sourcePath)
  )?.[1];
  if (!coverage) throw new Error('V8 did not report the selected target');
  if (!coverage.s || !coverage.f)
    throw new Error('V8 target execution receipt is invalid');
  const statements = Object.values(coverage.s);
  const functions = Object.values(coverage.f);
  const executedStatements = statements.filter(
    count => typeof count === 'number' && count > 0
  ).length;
  const executedFunctions = functions.filter(
    count => typeof count === 'number' && count > 0
  ).length;
  if (executedStatements === 0 && executedFunctions === 0) {
    throw new Error('V8 reports no executed target statements or functions');
  }
  return {
    executedStatements,
    totalStatements: statements.length,
    executedFunctions,
    totalFunctions: functions.length,
  };
}
