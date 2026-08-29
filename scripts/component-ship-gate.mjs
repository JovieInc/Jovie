#!/usr/bin/env node
/**
 * Hard component ship gate (JOV-4421).
 *
 * Fail closed when a shippable UI component is added/changed without:
 *   1. Matching unit/interaction test (colocated or verified @coverage-via;
 *      JOV-5451 rejects inert executable receipts)
 *   2. Matching Storybook story that imports the real component
 *   3. Static match checks (required props / state matrix hints)
 *   4. Story quality hygiene (no pure-black voids / fake CTAs)
 *   5. Multi-root story-coverage ratchet (lock_up + no uncovered growth)
 *   6. Fail-closed source-blind rendered certification (JOV-5400)
 *      including the Shadcn/Typeset outcome inventory (JOV-5438)
 *
 * Usage:
 *   pnpm component-ship-gate
 *   node scripts/component-ship-gate.mjs [--diff-base=origin/main] [--skip-quality] [--skip-ratchet] [--skip-rendered-cert]
 *
 * Env:
 *   COMPONENT_SHIP_DIFF_BASE / STORY_COVERAGE_DIFF_BASE / TURBO_SCM_BASE / GITHUB_BASE_REF
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { runRenderedCertification } from './component-rendered-certification.mjs';
import {
  COVERAGE_ROOTS,
  checkStoryMatchesComponent,
  extractExportedComponentNames,
  isUnderShipScope,
  listComponentsInRoot,
  normalizeRepoPath,
  parseCoverageVia,
  REPO_ROOT,
  readText,
  resolveCoverageViaPath,
  verifyCoverageVia,
} from './component-ship-policy.mjs';
import {
  compareCoverage,
  loadBaseline,
  measureAllRoots,
} from './story-coverage-ratchet.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CANONICAL_MARKETING_STORIES = Object.freeze([
  'apps/web/components/marketing/storybook/MarketingRecipes.stories.tsx',
  'apps/web/components/marketing/storybook/MarketingSections.stories.tsx',
  'apps/web/components/marketing/storybook/MarketingShells.stories.tsx',
]);
const TEST_FILE_RE = /\.(?:test|spec)\.[jt]sx?$/i;

function parseArgs(argv) {
  const flags = {
    diffBase: null,
    skipQuality: false,
    skipRatchet: false,
    skipRenderedCert: false,
    json: false,
    auditCoverageVia: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--diff-base='))
      flags.diffBase = arg.slice('--diff-base='.length);
    else if (arg === '--skip-quality') flags.skipQuality = true;
    else if (arg === '--skip-ratchet') flags.skipRatchet = true;
    else if (arg === '--skip-rendered-cert') flags.skipRenderedCert = true;
    else if (arg === '--audit-coverage-via') flags.auditCoverageVia = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
  }
  return flags;
}

function resolveDiffBase(explicit) {
  if (explicit) return explicit;
  if (process.env.COMPONENT_SHIP_DIFF_BASE) {
    return process.env.COMPONENT_SHIP_DIFF_BASE;
  }
  if (process.env.STORY_COVERAGE_DIFF_BASE) {
    return process.env.STORY_COVERAGE_DIFF_BASE;
  }
  if (process.env.TURBO_SCM_BASE) return process.env.TURBO_SCM_BASE;
  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`;
  }
  // Local default: compare against main when available.
  const probe = spawnSync('git', ['rev-parse', '--verify', 'origin/main'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (probe.status === 0) return 'origin/main';
  return null;
}

function changedFiles(diffBase) {
  if (!diffBase) return [];
  const result = spawnSync(
    'git',
    ['diff', '--diff-filter=ACMR', '--name-only', `${diffBase}...HEAD`],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(
      `could not resolve changed files from ${diffBase}: ${result.stderr?.trim() || result.stdout}`
    );
  }
  return result.stdout
    .split('\n')
    .map(l => normalizeRepoPath(l.trim()))
    .filter(Boolean);
}

function findAdjacentArtifacts(sourceRel, repoRoot = REPO_ROOT) {
  const dir = dirname(sourceRel);
  const base = sourceRel
    .split('/')
    .pop()
    .replace(/\.tsx$/i, '');
  const storyCandidates = [
    `${dir}/${base}.stories.tsx`,
    `${dir}/${base}.stories.ts`,
    `${dir}/${base[0]?.toUpperCase()}${base.slice(1)}.stories.tsx`,
  ];
  const testCandidates = [
    `${dir}/${base}.test.tsx`,
    `${dir}/${base}.test.ts`,
    `${dir}/${base}.spec.tsx`,
    `${dir}/${base}.spec.ts`,
  ];
  const storyRel =
    storyCandidates.find(p => existsSync(join(repoRoot, p))) ?? null;
  const testRel =
    testCandidates.find(p => existsSync(join(repoRoot, p))) ?? null;
  return { storyRel, testRel, base };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withoutTsxExtension(value) {
  return normalizeRepoPath(value).replace(/\.(?:tsx?|jsx?)$/i, '');
}

function moduleResolvesToSource({ moduleSpecifier, importerRel, sourceRel }) {
  const sourceWithoutExtension = withoutTsxExtension(sourceRel);
  let candidate;

  if (moduleSpecifier.startsWith('@/')) {
    candidate = `apps/web/${moduleSpecifier.slice(2)}`;
  } else if (moduleSpecifier.startsWith('.')) {
    candidate = join(dirname(importerRel), moduleSpecifier);
  } else {
    return false;
  }

  return withoutTsxExtension(candidate) === sourceWithoutExtension;
}

function parseTypeScriptSource(source, path) {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function walkAst(node, visit) {
  visit(node);
  ts.forEachChild(node, child => walkAst(child, visit));
}

function collectBindingNames(name, names = new Set()) {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return names;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element))
        collectBindingNames(element.name, names);
    }
  }
  return names;
}

function isDynamicImportExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isAwaitExpression(current))
  ) {
    current = current.expression;
  }
  return (
    Boolean(current) &&
    ts.isCallExpression(current) &&
    current.expression.kind === ts.SyntaxKind.ImportKeyword
  );
}

function isDynamicImportBinding(node) {
  let current = node.parent;
  while (
    current &&
    (ts.isObjectBindingPattern(current) ||
      ts.isArrayBindingPattern(current) ||
      ts.isBindingElement(current))
  ) {
    current = current.parent;
  }
  return (
    current &&
    ts.isVariableDeclaration(current) &&
    isDynamicImportExpression(current.initializer)
  );
}

function shadowedBindingNames(sourceFile, importedNames) {
  const candidates = new Set(importedNames);
  const shadowed = new Set();
  walkAst(sourceFile, node => {
    let bindingName = null;
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      if (
        ts.isVariableDeclaration(node) &&
        isDynamicImportExpression(node.initializer)
      ) {
        return;
      }
      bindingName = node.name;
    } else if (ts.isBindingElement(node)) {
      if (isDynamicImportBinding(node)) return;
      bindingName = node.name;
    } else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node)) &&
      node.name
    ) {
      bindingName = node.name;
    }
    if (!bindingName) return;
    for (const name of collectBindingNames(bindingName)) {
      if (candidates.has(name)) shadowed.add(name);
    }
  });
  return shadowed;
}

function exactRuntimeImports({
  sourceFile,
  importerRel,
  sourceRel,
  exportNames,
}) {
  const imports = [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause ||
      statement.importClause.isTypeOnly ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !moduleResolvesToSource({
        moduleSpecifier: statement.moduleSpecifier.text,
        importerRel,
        sourceRel,
      })
    ) {
      continue;
    }

    const importedNames = [];
    if (statement.importClause.name) {
      importedNames.push({
        exportName: exportNames[0] ?? statement.importClause.name.text,
        localName: statement.importClause.name.text,
      });
    }

    const bindings = statement.importClause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        const exportName = (element.propertyName ?? element.name).text;
        if (!exportNames.includes(exportName)) continue;
        importedNames.push({
          exportName,
          localName: element.name.text,
        });
      }
    }

    if (importedNames.length > 0) {
      imports.push({
        statement: statement.getText(sourceFile),
        importedNames,
      });
    }
  }

  walkAst(sourceFile, node => {
    if (
      !ts.isCallExpression(node) ||
      node.expression.kind !== ts.SyntaxKind.ImportKeyword
    ) {
      return;
    }
    if (
      !node.arguments[0] ||
      !ts.isStringLiteral(node.arguments[0]) ||
      !moduleResolvesToSource({
        moduleSpecifier: node.arguments[0].text,
        importerRel,
        sourceRel,
      })
    ) {
      return;
    }

    let parent = node.parent;
    if (parent && ts.isAwaitExpression(parent)) parent = parent.parent;
    while (
      parent &&
      (ts.isAsExpression(parent) ||
        ts.isParenthesizedExpression(parent) ||
        ts.isSatisfiesExpression(parent))
    ) {
      parent = parent.parent;
    }
    if (!parent || !ts.isVariableDeclaration(parent)) return;

    const importedNames = [];
    if (ts.isIdentifier(parent.name)) {
      for (const exportName of exportNames) {
        importedNames.push({
          exportName,
          localName: exportName,
        });
      }
    } else if (ts.isObjectBindingPattern(parent.name)) {
      for (const element of parent.name.elements) {
        if (
          !ts.isBindingElement(element) ||
          element.dotDotDotToken ||
          !ts.isIdentifier(element.name)
        ) {
          continue;
        }
        const exportName =
          element.propertyName && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : element.name.text;
        if (!exportNames.includes(exportName)) continue;
        importedNames.push({
          exportName,
          localName: element.name.text,
        });
      }
    }

    if (importedNames.length > 0) {
      imports.push({
        statement: node.getText(sourceFile),
        importedNames,
      });
    }
  });

  return imports;
}

function staticStringValue(node, bindings = new Map(), seen = new Set()) {
  const literal = unwrapStringLiteral(node);
  if (literal !== null) return literal;
  if (node && ts.isIdentifier(node) && bindings.has(node.text)) {
    if (seen.has(node.text)) return null;
    return staticStringValue(
      bindings.get(node.text),
      bindings,
      new Set([...seen, node.text])
    );
  }
  if (
    node &&
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticStringValue(node.left, bindings, seen);
    const right = staticStringValue(node.right, bindings, seen);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

function isExactModuleMocked({ sourceFile, importerRel, sourceRel }) {
  const moduleBindings = new Map();
  walkAst(sourceFile, node => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) return;
    moduleBindings.set(node.name.text, node.initializer);
  });

  let mocked = false;
  walkAst(sourceFile, node => {
    if (mocked || !ts.isCallExpression(node)) return;
    const callee = node.expression;
    if (
      !ts.isPropertyAccessExpression(callee) ||
      !['vi', 'jest'].includes(callee.expression.getText(sourceFile)) ||
      !['mock', 'doMock', 'unstable_mockModule'].includes(callee.name.text)
    ) {
      return;
    }
    const moduleArgument = node.arguments[0];
    if (!moduleArgument) return;
    const moduleSpecifier = staticStringValue(moduleArgument, moduleBindings);
    if (
      moduleSpecifier === null ||
      moduleResolvesToSource({ moduleSpecifier, importerRel, sourceRel })
    ) {
      mocked = true;
    }
  });
  return mocked;
}

const RENDERER_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  'react-dom/server',
  'react-test-renderer',
  '@testing-library/react',
  '@testing-library/react/pure',
]);

const RENDERER_NAMED_EXPORTS = new Set([
  'createElement',
  'createFactory',
  'jsx',
  'jsxs',
  'jsxDEV',
  'render',
  'hydrate',
  'createRoot',
  'hydrateRoot',
  'renderToString',
  'renderToStaticMarkup',
  'renderToPipeableStream',
  'renderToReadableStream',
  'create',
]);

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function importedRendererBindings(sourceFile) {
  const named = new Set();
  const namespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause ||
      statement.importClause.isTypeOnly ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !RENDERER_MODULES.has(statement.moduleSpecifier.text)
    ) {
      continue;
    }
    if (statement.importClause.name) {
      namespaces.add(statement.importClause.name.text);
    }
    const bindings = statement.importClause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        const importedName = (element.propertyName ?? element.name).text;
        if (RENDERER_NAMED_EXPORTS.has(importedName)) {
          named.add(element.name.text);
        }
      }
    }
  }
  const shadowed = shadowedBindingNames(sourceFile, [...named, ...namespaces]);
  return {
    named: new Set([...named].filter(name => !shadowed.has(name))),
    namespaces: new Set([...namespaces].filter(name => !shadowed.has(name))),
  };
}

function isImportedRendererCallee(expression, rendererBindings) {
  const expr = unwrapExpression(expression);
  if (ts.isIdentifier(expr) && rendererBindings.named.has(expr.text)) {
    return true;
  }
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    rendererBindings.namespaces.has(expr.expression.text) &&
    RENDERER_NAMED_EXPORTS.has(expr.name.text)
  ) {
    return true;
  }
  if (
    ts.isPropertyAccessExpression(expr) &&
    expr.name.text === 'render' &&
    ts.isCallExpression(unwrapExpression(expr.expression))
  ) {
    return isImportedRendererCallee(
      unwrapExpression(expr.expression).expression,
      rendererBindings
    );
  }
  return false;
}

function isJsxTagUse(node) {
  const parent = node.parent;
  return Boolean(
    parent &&
      (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
      parent.tagName === node
  );
}

function isDirectExecuteUse(node) {
  const parent = node.parent;
  return Boolean(
    parent &&
      ((ts.isCallExpression(parent) && parent.expression === node) ||
        (ts.isNewExpression(parent) && parent.expression === node))
  );
}

function isRendererArgumentZeroUse(node, rendererBindings) {
  let current = node;
  let parent = node.parent;
  while (
    parent &&
    (ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isTypeAssertionExpression(parent))
  ) {
    current = parent;
    parent = parent.parent;
  }
  return Boolean(
    parent &&
      ts.isCallExpression(parent) &&
      parent.arguments[0] === current &&
      isImportedRendererCallee(parent.expression, rendererBindings)
  );
}

function hasRuntimeImportedUse(sourceFile, importedNames) {
  const allNames = importedNames.map(item => item.localName);
  const shadowedNames = shadowedBindingNames(sourceFile, allNames);
  const names = new Set(allNames.filter(name => !shadowedNames.has(name)));
  if (names.size === 0) return false;
  const rendererBindings = importedRendererBindings(sourceFile);
  let used = false;
  walkAst(sourceFile, node => {
    if (!used && ts.isIdentifier(node) && names.has(node.text)) {
      used =
        isJsxTagUse(node) ||
        isDirectExecuteUse(node) ||
        isRendererArgumentZeroUse(node, rendererBindings);
    }
  });
  return used;
}

function unwrapStringLiteral(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isSatisfiesExpression(current))
  ) {
    current = current.expression;
  }
  return current &&
    (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current))
    ? current.text
    : null;
}

function nodeFsReadBindings(sourceFile) {
  const direct = new Set();
  const namespace = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause ||
      statement.importClause.isTypeOnly ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !['node:fs', 'fs'].includes(statement.moduleSpecifier.text)
    ) {
      continue;
    }
    if (statement.importClause.name) {
      namespace.add(statement.importClause.name.text);
    }
    const bindings = statement.importClause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespace.add(bindings.name.text);
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        const importedName = (element.propertyName ?? element.name).text;
        if (importedName === 'readFileSync') direct.add(element.name.text);
      }
    }
  }

  const shadowed = shadowedBindingNames(sourceFile, [...direct, ...namespace]);
  return {
    direct: new Set([...direct].filter(name => !shadowed.has(name))),
    namespace: new Set([...namespace].filter(name => !shadowed.has(name))),
  };
}

function isReadFileSyncCall(node, bindings) {
  if (!ts.isCallExpression(node)) return false;
  return (
    (ts.isIdentifier(node.expression) &&
      bindings.direct.has(node.expression.text)) ||
    (ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'readFileSync' &&
      ts.isIdentifier(node.expression.expression) &&
      bindings.namespace.has(node.expression.expression.text))
  );
}

function joinedLiteralPath(node) {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;
  if (!name || !['join', 'resolve'].includes(name)) return null;
  const parts = [];
  for (const argument of node.arguments) {
    const literal = unwrapStringLiteral(argument);
    if (literal !== null) parts.push(literal);
  }
  if (parts.length === 0) return null;
  return parts.join('/').replaceAll(/\/+/g, '/');
}

function localReadWrappers(sourceFile, readBindings) {
  const wrappers = new Set();
  const consider = (name, body) => {
    if (!name || !body) return;
    let callsRead = false;
    walkAst(body, node => {
      if (isReadFileSyncCall(node, readBindings)) callsRead = true;
    });
    if (callsRead) wrappers.add(name);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      consider(statement.name?.text, statement.body);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }
      const init = declaration.initializer;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        consider(declaration.name.text, init.body);
      }
    }
  }
  return wrappers;
}

function isSourceReadCall(node, readBindings, wrappers) {
  if (isReadFileSyncCall(node, readBindings)) return true;
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    wrappers.has(node.expression.text)
  );
}

function hasExplicitSourceRead(sourceFile, sourceRel) {
  const readBindings = nodeFsReadBindings(sourceFile);
  if (readBindings.direct.size === 0 && readBindings.namespace.size === 0) {
    return false;
  }
  const exactPaths = new Set([
    sourceRel,
    sourceRel.replace(/^apps\/web\//, ''),
  ]);
  const wrappers = localReadWrappers(sourceFile, readBindings);
  const identifierInits = new Map();
  walkAst(sourceFile, node => {
    if (
      !ts.isVariableDeclaration(node) ||
      !ts.isIdentifier(node.name) ||
      !node.initializer
    ) {
      return;
    }
    identifierInits.set(node.name.text, node.initializer);
  });

  const isJoinOrResolveCall = node => {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : null;
    return name === 'join' || name === 'resolve';
  };

  const nodeReadsExactPath = (node, seen = new Set()) => {
    if (!node) return false;
    const resolved = staticStringValue(node, identifierInits);
    if (resolved && exactPaths.has(resolved)) return true;
    const joined = joinedLiteralPath(node);
    if (joined && exactPaths.has(joined)) return true;
    if (isJoinOrResolveCall(node)) {
      return node.arguments.some(argument =>
        nodeReadsExactPath(argument, seen)
      );
    }
    if (ts.isIdentifier(node) && identifierInits.has(node.text)) {
      if (seen.has(node.text)) return false;
      return nodeReadsExactPath(
        identifierInits.get(node.text),
        new Set([...seen, node.text])
      );
    }
    return false;
  };

  const callReadsExactPath = call => {
    const pathArg = call.arguments[0];
    return Boolean(pathArg) && nodeReadsExactPath(pathArg);
  };

  const assertedNames = new Set();
  let directReadAssertion = false;
  walkAst(sourceFile, node => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== 'expect' ||
      node.arguments.length === 0
    ) {
      return;
    }
    const subject = node.arguments[0];
    if (ts.isIdentifier(subject)) assertedNames.add(subject.text);
    walkAst(subject, child => {
      if (
        isSourceReadCall(child, readBindings, wrappers) &&
        callReadsExactPath(child)
      ) {
        directReadAssertion = true;
      }
    });
  });

  if (directReadAssertion) return true;

  let assertedReadBinding = false;
  walkAst(sourceFile, node => {
    if (
      assertedReadBinding ||
      !ts.isVariableDeclaration(node) ||
      !ts.isIdentifier(node.name) ||
      !assertedNames.has(node.name.text) ||
      !node.initializer
    ) {
      return;
    }
    walkAst(node.initializer, child => {
      if (
        isSourceReadCall(child, readBindings, wrappers) &&
        callReadsExactPath(child)
      ) {
        assertedReadBinding = true;
      }
    });
  });
  return assertedReadBinding;
}

export function hasRealLegacyTestEvidence({
  testSource,
  testRel,
  sourceRel,
  componentSource,
}) {
  const sourceFile = parseTypeScriptSource(testSource, testRel);
  const exportNames = extractExportedComponentNames(componentSource);
  const imports = exactRuntimeImports({
    sourceFile,
    importerRel: testRel,
    sourceRel,
    exportNames,
  });
  const importedNames = imports.flatMap(entry => entry.importedNames);
  const usesImportedComponent =
    imports.length > 0 &&
    !isExactModuleMocked({ sourceFile, importerRel: testRel, sourceRel }) &&
    hasRuntimeImportedUse(sourceFile, importedNames);

  return usesImportedComponent || hasExplicitSourceRead(sourceFile, sourceRel);
}

export function inspectCoverageViaReceipt({
  viaRel,
  sourceRel,
  componentBase,
  componentSource,
  repoRoot = REPO_ROOT,
}) {
  return verifyCoverageVia({
    viaRel,
    componentRel: sourceRel,
    componentBase,
    repoRoot,
    componentSource,
    hasExecutableEvidence: hasRealLegacyTestEvidence,
  });
}

export function auditCoverageViaReceipts({ repoRoot = REPO_ROOT } = {}) {
  const seen = new Set();
  const receipts = [];
  const invalid = [];

  for (const root of COVERAGE_ROOTS) {
    for (const component of listComponentsInRoot(root, repoRoot)) {
      if (seen.has(component.sourceRel)) continue;
      seen.add(component.sourceRel);
      const componentSource = readText(component.sourceRel, repoRoot);
      const via = parseCoverageVia(componentSource);
      if (!via) continue;
      const viaRel = resolveCoverageViaPath(via, component.sourceRel, repoRoot);
      const inspected = inspectCoverageViaReceipt({
        viaRel,
        sourceRel: component.sourceRel,
        componentBase: component.component,
        componentSource,
        repoRoot,
      });
      const receipt = {
        path: component.sourceRel,
        viaRel,
        ok: inspected.ok,
        detail: inspected.detail,
      };
      receipts.push(receipt);
      if (!inspected.ok) invalid.push(receipt);
    }
  }

  return {
    ok: invalid.length === 0,
    receipts,
    invalid,
  };
}

function findChangedLegacyTest({
  changed,
  sourceRel,
  componentSource,
  repoRoot,
}) {
  for (const testRel of changed) {
    if (!TEST_FILE_RE.test(testRel)) continue;
    if (!existsSync(join(repoRoot, testRel))) continue;
    const testSource = readText(testRel, repoRoot);
    if (
      hasRealLegacyTestEvidence({
        testSource,
        testRel,
        sourceRel,
        componentSource,
      })
    ) {
      return testRel;
    }
  }
  return null;
}

function findCanonicalMarketingStory({ sourceRel, componentSource, repoRoot }) {
  if (
    !sourceRel.startsWith('apps/web/components/marketing/') &&
    !sourceRel.startsWith('apps/web/components/site/')
  ) {
    return null;
  }

  for (const storyRel of CANONICAL_MARKETING_STORIES) {
    if (!existsSync(join(repoRoot, storyRel))) continue;
    const storySource = readText(storyRel, repoRoot);
    const sourceFile = parseTypeScriptSource(storySource, storyRel);
    const exportNames = extractExportedComponentNames(componentSource);
    const imports = exactRuntimeImports({
      sourceFile,
      importerRel: storyRel,
      sourceRel,
      exportNames,
    });
    const importedNames = imports.flatMap(entry => entry.importedNames);
    if (importedNames.length === 0) continue;
    if (isExactModuleMocked({ sourceFile, importerRel: storyRel, sourceRel })) {
      continue;
    }

    const importByLocalName = new Map(
      importedNames.map(item => [item.localName, item.exportName])
    );
    const openingTags = [];
    const componentAllowlist = new Set();

    for (const statement of sourceFile.statements) {
      if (
        !ts.isVariableStatement(statement) ||
        !statement.modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
        )
      ) {
        continue;
      }

      const statementTags = [];
      walkAst(statement, node => {
        if (
          !ts.isJsxOpeningElement(node) &&
          !ts.isJsxSelfClosingElement(node)
        ) {
          return;
        }
        if (!ts.isIdentifier(node.tagName)) return;
        const exportName = importByLocalName.get(node.tagName.text);
        if (!exportName) return;
        statementTags.push(
          node
            .getText(sourceFile)
            .replace(
              new RegExp(`^<${escapeRegExp(node.tagName.text)}\\b`),
              `<${exportName}`
            )
        );
      });
      if (statementTags.length === 0) continue;
      openingTags.push(...statementTags);

      if (exportNames.length !== 1) continue;
      walkAst(statement, node => {
        if (
          !ts.isPropertyAssignment(node) ||
          node.name.getText(sourceFile).replace(/['"]/g, '') !==
            'uncoveredPropsByComponent' ||
          !ts.isObjectLiteralExpression(node.initializer)
        ) {
          return;
        }
        for (const property of node.initializer.properties) {
          if (
            !ts.isPropertyAssignment(property) ||
            !ts.isArrayLiteralExpression(property.initializer)
          ) {
            continue;
          }
          const componentName = property.name
            .getText(sourceFile)
            .replace(/['"]/g, '');
          if (!importByLocalName.has(componentName)) continue;
          for (const element of property.initializer.elements) {
            const value = unwrapStringLiteral(element);
            if (value) componentAllowlist.add(value);
          }
        }
      });
    }
    if (openingTags.length === 0) continue;

    const scopedStorySource = [
      ...imports.map(entry => entry.statement),
      ...openingTags,
      componentAllowlist.size > 0
        ? `const componentCoverage = { uncoveredProps: ${JSON.stringify([...componentAllowlist])} };`
        : '',
    ].join('\n');
    const match = checkStoryMatchesComponent({
      componentSource,
      storySource: scopedStorySource,
      componentRel: sourceRel,
      storyRel,
    });
    if (match.ok) return { storyRel, storySource: scopedStorySource };
  }

  return null;
}

function existedAtDiffBase(diffBase, sourceRel) {
  const result = spawnSync(
    'git',
    ['cat-file', '-e', `${diffBase}:${sourceRel}`],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  return result.status === 0;
}

/**
 * Diff gate for changed component sources.
 */
export function checkChangedComponents(
  changed,
  { repoRoot = REPO_ROOT, legacyComponents = new Set() } = {}
) {
  const issues = [];
  const componentSources = changed.filter(isUnderShipScope);

  for (const sourceRel of componentSources) {
    const {
      storyRel: adjacentStoryRel,
      testRel,
      base,
    } = findAdjacentArtifacts(sourceRel, repoRoot);
    const canUseCentralEvidence = legacyComponents.has(sourceRel);
    let componentSource;
    try {
      componentSource = readText(sourceRel, repoRoot);
    } catch {
      issues.push({
        path: sourceRel,
        rule: 'source-unreadable',
        detail: 'changed component source is unreadable',
      });
      continue;
    }

    // --- Test requirement ---
    const via = parseCoverageVia(componentSource);
    let testOk = Boolean(testRel);
    let resolvedTest = testRel;

    if (!testOk && via) {
      const viaRel = resolveCoverageViaPath(via, sourceRel, repoRoot);
      const coverageVia = inspectCoverageViaReceipt({
        viaRel,
        sourceRel,
        componentBase: base,
        componentSource,
        repoRoot,
      });
      if (coverageVia.ok) {
        testOk = true;
        resolvedTest = viaRel;
      } else {
        issues.push({
          path: sourceRel,
          rule: 'coverage-via-invalid',
          detail: coverageVia.detail,
        });
      }
    }

    if (!testOk && canUseCentralEvidence) {
      const centralTest = findChangedLegacyTest({
        changed,
        sourceRel,
        componentSource,
        repoRoot,
      });
      if (centralTest) {
        testOk = true;
        resolvedTest = centralTest;
      }
    }

    if (!testOk) {
      issues.push({
        path: sourceRel,
        rule: 'missing-test',
        detail: `No colocated ${base}.test.tsx (or .spec) and no valid // @coverage-via directive`,
      });
    } else if (resolvedTest && !changed.includes(resolvedTest)) {
      // Behavior/API changes must update the test in the same PR.
      issues.push({
        path: sourceRel,
        rule: 'test-not-touched',
        detail: `Component changed but test ${resolvedTest} was not touched in this diff. Update the test (or include it in the PR).`,
      });
    }

    // --- Story presence ---
    const centralStory = canUseCentralEvidence
      ? findCanonicalMarketingStory({
          sourceRel,
          componentSource,
          repoRoot,
        })
      : null;
    const storyRel = adjacentStoryRel ?? centralStory?.storyRel ?? null;

    if (!storyRel) {
      issues.push({
        path: sourceRel,
        rule: 'missing-story',
        detail: `No adjacent ${base}.stories.tsx or verified canonical marketing story`,
      });
      continue;
    }

    // --- Match checks ---
    let storySource = adjacentStoryRel ? null : centralStory?.storySource;
    try {
      storySource ??= readText(storyRel, repoRoot);
    } catch {
      issues.push({
        path: storyRel,
        rule: 'story-unreadable',
        detail: 'story file exists but is unreadable',
      });
      continue;
    }

    const match = checkStoryMatchesComponent({
      componentSource,
      storySource,
      componentRel: sourceRel,
      storyRel,
    });
    for (const finding of match.findings) {
      issues.push({
        path: sourceRel,
        rule: finding.rule,
        detail: finding.detail,
      });
    }
  }

  return {
    ok: issues.length === 0,
    applicable: componentSources.length > 0,
    changedComponents: componentSources,
    issues,
  };
}

function runStoryQuality() {
  const script = join(__dirname, 'storybook-story-quality-guard.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status ?? 1,
  };
}

function runRatchet() {
  const measurement = measureAllRoots();
  const baseline = loadBaseline();
  const comparison = compareCoverage(measurement, baseline);
  return { ok: comparison.ok, comparison, measurement };
}

export function runComponentShipGate(options = {}) {
  const flags = {
    diffBase: options.diffBase ?? resolveDiffBase(null),
    skipQuality: options.skipQuality ?? false,
    skipRatchet: options.skipRatchet ?? false,
    skipRenderedCert: options.skipRenderedCert ?? false,
    headSha: options.headSha ?? null,
    comparativeQualificationControls: options.comparativeQualificationControls,
  };

  const report = {
    schemaVersion: 1,
    gate: 'component-ship-gate',
    diffBase: flags.diffBase,
    sections: {},
    ok: true,
  };

  // 1) Diff gate (skip when no base — still run ratchet/quality)
  if (flags.diffBase) {
    const changed = changedFiles(flags.diffBase);
    const legacyComponents = new Set(
      changed
        .filter(isUnderShipScope)
        .filter(sourceRel => existedAtDiffBase(flags.diffBase, sourceRel))
    );
    const diff = checkChangedComponents(changed, { legacyComponents });
    report.sections.diff = diff;
    if (!diff.ok) report.ok = false;
  } else {
    report.sections.diff = {
      ok: true,
      applicable: false,
      changedComponents: [],
      issues: [],
      note: 'no diff base; skipped changed-component checks',
    };
  }

  // 2) Story quality
  if (!flags.skipQuality) {
    const quality = runStoryQuality();
    report.sections.quality = {
      ok: quality.ok,
      output: quality.output.trim().slice(0, 2000),
    };
    if (!quality.ok) report.ok = false;
  } else {
    report.sections.quality = { ok: true, skipped: true };
  }

  // 3) Multi-root ratchet
  if (!flags.skipRatchet) {
    try {
      const ratchet = runRatchet();
      report.sections.ratchet = {
        ok: ratchet.ok,
        message: ratchet.comparison.message,
        roots: (ratchet.comparison.roots ?? []).map(r => ({
          root: r.root,
          ok: r.ok,
          message: r.message,
        })),
      };
      if (!ratchet.ok) report.ok = false;
    } catch (error) {
      report.sections.ratchet = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
      report.ok = false;
    }
  } else {
    report.sections.ratchet = { ok: true, skipped: true };
  }

  // 4) Source-blind rendered certification (JOV-5400)
  if (!flags.skipRenderedCert) {
    try {
      const rendered = runRenderedCertification({
        headSha: flags.headSha ?? undefined,
        comparativeQualificationControls:
          flags.comparativeQualificationControls,
      });
      report.sections.renderedCertification = {
        ok: rendered.ok,
        schema: rendered.schema,
        receipt: rendered.receipt,
      };
      if (!rendered.ok) report.ok = false;
    } catch (error) {
      report.sections.renderedCertification = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
      report.ok = false;
    }
  } else {
    report.sections.renderedCertification = { ok: true, skipped: true };
  }

  return report;
}

function printReport(report) {
  console.log(`[component-ship-gate] diffBase=${report.diffBase ?? '(none)'}`);

  const diff = report.sections.diff;
  if (diff?.applicable) {
    console.log(
      `[component-ship-gate] changed components: ${diff.changedComponents.length}`
    );
    for (const issue of diff.issues ?? []) {
      console.error(
        `::error file=${issue.path}::[${issue.rule}] ${issue.detail}`
      );
      console.error(`- ${issue.path}: [${issue.rule}] ${issue.detail}`);
    }
    if (diff.ok) {
      console.log('[component-ship-gate] diff: ok');
    }
  } else {
    console.log(
      `[component-ship-gate] diff: ${diff?.note ?? 'no in-scope component sources changed'}`
    );
  }

  const quality = report.sections.quality;
  if (quality?.skipped) {
    console.log('[component-ship-gate] quality: skipped');
  } else if (quality?.ok) {
    console.log(`[component-ship-gate] quality: ${quality.output || 'ok'}`);
  } else {
    console.error('[component-ship-gate] quality: FAIL');
    if (quality?.output) console.error(quality.output);
  }

  const ratchet = report.sections.ratchet;
  if (ratchet?.skipped) {
    console.log('[component-ship-gate] ratchet: skipped');
  } else if (ratchet?.ok) {
    for (const root of ratchet.roots ?? []) {
      console.log(`  ${root.message}`);
    }
    console.log('[component-ship-gate] ratchet: ok');
  } else {
    console.error('[component-ship-gate] ratchet: FAIL');
    console.error(ratchet?.message ?? 'unknown ratchet failure');
    for (const root of ratchet.roots ?? []) {
      if (!root.ok) console.error(`  ${root.message}`);
    }
  }

  const rendered = report.sections.renderedCertification;
  if (rendered?.skipped) {
    console.log('[component-ship-gate] rendered-cert: skipped');
  } else if (rendered?.ok) {
    const head = rendered.receipt?.headSha ?? 'unknown';
    console.log(`[component-ship-gate] rendered-cert: ok head=${head}`);
    for (const item of rendered.receipt?.fixtures ?? []) {
      console.log(`  fixture ${item.id}: ${item.verdict}`);
    }
    for (const item of rendered.receipt?.landingBatch ?? []) {
      console.log(`  landing ${item.id}: ${item.verdict}`);
    }
    const outcome = rendered.receipt?.shadcnOutcome;
    if (outcome) {
      console.log(
        `[component-ship-gate] shadcn-outcome: ${outcome.ok ? 'ok' : 'FAIL'} enrolled=${(outcome.enrolled ?? []).length}`
      );
      for (const item of outcome.fixtures ?? []) {
        console.log(`  outcome-fixture ${item.id}: ${item.verdict}`);
      }
      for (const item of outcome.enrolledBatch ?? []) {
        console.log(`  outcome-batch ${item.id}: ${item.verdict}`);
      }
      const comparative = outcome.comparativeQualityBar;
      if (comparative) {
        console.log(
          `  quality-bar inventory: ${comparative.inventory.rubricEnrolled}/${comparative.inventory.total} rubric-enrolled, ${comparative.inventory.pendingComparison} pending comparison`
        );
        for (const item of comparative.fixtures ?? []) {
          console.log(`  quality-bar fixture ${item.id}: ${item.verdict}`);
        }
        for (const item of comparative.qualificationControls ?? []) {
          console.log(
            `  quality-bar qualification control ${item.baselineId}: ${item.verdict}`
          );
        }
      }
    }
  } else {
    console.error('[component-ship-gate] rendered-cert: FAIL');
    if (rendered?.message) console.error(rendered.message);
    for (const issue of rendered?.receipt?.issues ?? []) {
      console.error(`- ${issue}`);
    }
  }

  if (report.ok) {
    console.log('[component-ship-gate] PASS');
  } else {
    console.error(
      '[component-ship-gate] FAIL — shippable UI components require matching tests + stories + rendered certification (JOV-4421, JOV-5400, JOV-5438)'
    );
  }
}

function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  if (flags.help) {
    console.log(`Usage: node scripts/component-ship-gate.mjs [options]
  --diff-base=<ref>   Git base for changed-file detection (default: origin/main)
  --skip-quality         Skip storybook quality guard
  --skip-ratchet         Skip multi-root story coverage ratchet
  --skip-rendered-cert   Skip source-blind rendered certification
  --audit-coverage-via   Whole-tree executable @coverage-via receipt audit
  --json                 Print machine-readable report`);
    return 0;
  }

  if (flags.auditCoverageVia) {
    const audit = auditCoverageViaReceipts();
    if (flags.json) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(
        `[component-ship-gate] coverage-via audit: ${audit.receipts.length} receipts, ${audit.invalid.length} invalid`
      );
      for (const issue of audit.invalid) {
        console.error(`- ${issue.path}: ${issue.detail}`);
      }
      if (audit.ok) {
        console.log('[component-ship-gate] coverage-via audit: PASS');
      } else {
        console.error('[component-ship-gate] coverage-via audit: FAIL');
      }
    }
    return audit.ok ? 0 : 1;
  }

  const report = runComponentShipGate({
    diffBase: flags.diffBase ?? resolveDiffBase(null),
    skipQuality: flags.skipQuality,
    skipRatchet: flags.skipRatchet,
    skipRenderedCert: flags.skipRenderedCert,
  });

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  return report.ok ? 0 : 1;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(2);
  }
}
