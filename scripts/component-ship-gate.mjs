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
 *   7. Fail-closed live Storybook certification for enrolled canonical
 *      Badge/Button/Card stories (JOV-5454)
 *
 * Usage:
 *   pnpm component-ship-gate
 *   node scripts/component-ship-gate.mjs [--diff-base=origin/main] [--skip-quality] [--skip-ratchet] [--skip-rendered-cert] [--skip-live-storybook]
 *
 * Env:
 *   COMPONENT_SHIP_DIFF_BASE / STORY_COVERAGE_DIFF_BASE / TURBO_SCM_BASE / GITHUB_BASE_REF
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { runLiveStorybookCertification } from './component-live-storybook-certification.mjs';
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
    skipLiveStorybook: false,
    json: false,
    auditCoverageVia: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--diff-base='))
      flags.diffBase = arg.slice('--diff-base='.length);
    else if (arg === '--skip-quality') flags.skipQuality = true;
    else if (arg === '--skip-ratchet') flags.skipRatchet = true;
    else if (arg === '--skip-rendered-cert') flags.skipRenderedCert = true;
    else if (arg === '--skip-live-storybook') flags.skipLiveStorybook = true;
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

function isLexicalScopeNode(node, sourceFile) {
  return (
    node === sourceFile ||
    ts.isFunctionLike(node) ||
    ts.isBlock(node) ||
    ts.isModuleBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node)
  );
}

function nearestLexicalScope(node, sourceFile) {
  for (let current = node; current; current = current.parent) {
    if (isLexicalScopeNode(current, sourceFile)) return current;
  }
  return sourceFile;
}

function nearestFunctionScope(node, sourceFile) {
  for (let current = node; current; current = current.parent) {
    if (current === sourceFile || ts.isFunctionLike(current)) {
      return current;
    }
  }
  return sourceFile;
}

function addScopedBinding(bindings, scope, name) {
  if (!scope || !name) return;
  let names = bindings.get(scope);
  if (!names) {
    names = new Set();
    bindings.set(scope, names);
  }
  for (const bindingName of collectBindingNames(name)) {
    names.add(bindingName);
  }
}

function scopedBindings(sourceFile) {
  const bindings = new Map();
  walkAst(sourceFile, node => {
    if (ts.isVariableDeclaration(node)) {
      // A destructured dynamic import is an actual component import, not a
      // local declaration that shadows the binding collected from the exact
      // module import analysis.
      if (isDynamicImportExpression(node.initializer)) return;
      const scope =
        (node.parent.flags & ts.NodeFlags.BlockScoped) === 0
          ? nearestFunctionScope(node.parent, sourceFile)
          : nearestLexicalScope(node.parent, sourceFile);
      addScopedBinding(bindings, scope, node.name);
      return;
    }
    if (ts.isParameter(node)) {
      addScopedBinding(
        bindings,
        nearestFunctionScope(node, sourceFile),
        node.name
      );
      return;
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name
    ) {
      addScopedBinding(
        bindings,
        nearestLexicalScope(node.parent, sourceFile),
        node.name
      );
      return;
    }
    if (
      (ts.isFunctionExpression(node) || ts.isClassExpression(node)) &&
      node.name
    ) {
      addScopedBinding(bindings, node, node.name);
    }
  });
  return bindings;
}

function isBindingShadowedAt(node, name, sourceFile, bindings) {
  for (let current = node.parent; current; current = current.parent) {
    if (!isLexicalScopeNode(current, sourceFile)) continue;
    if (bindings.get(current)?.has(name)) return true;
    if (current === sourceFile) break;
  }
  return false;
}

function variableDeclarationScope(declaration, sourceFile) {
  const declarationList = declaration.parent;
  const scopeNode = declarationList?.parent ?? declaration;
  return (declarationList.flags & ts.NodeFlags.BlockScoped) === 0
    ? nearestFunctionScope(scopeNode, sourceFile)
    : nearestLexicalScope(scopeNode, sourceFile);
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

const RUNTIME_COMPONENT_RENDERER_MODULES = new Map([
  ['@testing-library/react', new Set(['render'])],
  ['@testing-library/react/pure', new Set(['render'])],
  ['enzyme', new Set(['mount', 'shallow'])],
  ['react-dom', new Set(['render', 'hydrate'])],
  [
    'react-dom/server',
    new Set([
      'renderToString',
      'renderToStaticMarkup',
      'renderToPipeableStream',
      'renderToReadableStream',
    ]),
  ],
  ['react-test-renderer', new Set(['create'])],
]);

const RUNTIME_COMPONENT_ELEMENT_FACTORY_MODULES = new Map([
  ['react', new Set(['createElement'])],
  ['react/jsx-dev-runtime', new Set(['jsxDEV'])],
  ['react/jsx-runtime', new Set(['jsx', 'jsxs'])],
]);

const RUNTIME_COMPONENT_ROOT_FACTORY_MODULES = new Map([
  ['react-dom/client', new Set(['createRoot', 'hydrateRoot'])],
]);

function runtimeComponentConsumerBindings(sourceFile, consumerModules) {
  const direct = new Map();
  const namespaces = new Map();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause ||
      statement.importClause.isTypeOnly ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const moduleName = statement.moduleSpecifier.text;
    const consumers = consumerModules.get(moduleName);
    if (!consumers) continue;

    if (statement.importClause.name) {
      namespaces.set(statement.importClause.name.text, consumers);
    }

    const bindings = statement.importClause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.set(bindings.name.text, consumers);
      continue;
    }
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      const importedName = (element.propertyName ?? element.name).text;
      if (consumers.has(importedName)) {
        direct.set(element.name.text, importedName);
      }
    }
  }

  return { direct, namespaces };
}

function isRuntimeComponentRootConsumer(
  expression,
  rootBindings,
  sourceFile,
  scopedBindingNames
) {
  const value = unwrapRuntimeValue(expression);
  if (
    !ts.isPropertyAccessExpression(value) ||
    value.name.text !== 'render' ||
    !ts.isCallExpression(unwrapRuntimeValue(value.expression))
  ) {
    return false;
  }
  const rootCall = unwrapRuntimeValue(value.expression);
  return isRuntimeComponentConsumer(
    rootCall.expression,
    rootBindings,
    sourceFile,
    scopedBindingNames
  );
}

function isRuntimeComponentRenderer(
  expression,
  rendererBindings,
  rootBindings,
  sourceFile,
  scopedBindingNames
) {
  return (
    isRuntimeComponentConsumer(
      expression,
      rendererBindings,
      sourceFile,
      scopedBindingNames
    ) ||
    isRuntimeComponentRootConsumer(
      expression,
      rootBindings,
      sourceFile,
      scopedBindingNames
    )
  );
}

function isRuntimeComponentConsumer(
  expression,
  bindings,
  sourceFile,
  scopedBindingNames
) {
  const value = unwrapRuntimeValue(expression);
  if (ts.isIdentifier(value)) {
    return (
      bindings.direct.has(value.text) &&
      !isBindingShadowedAt(value, value.text, sourceFile, scopedBindingNames)
    );
  }
  return (
    ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    bindings.namespaces.has(value.expression.text) &&
    !isBindingShadowedAt(
      value.expression,
      value.expression.text,
      sourceFile,
      scopedBindingNames
    ) &&
    bindings.namespaces.get(value.expression.text).has(value.name.text)
  );
}

function isFunctionNode(node) {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node)
  );
}

const EXECUTED_TEST_CALLBACKS = new Set([
  'afterAll',
  'afterEach',
  'beforeAll',
  'beforeEach',
  'describe',
  'it',
  'test',
]);

const EXECUTED_TEST_CALLBACK_MODIFIERS = new Set([
  'concurrent',
  'each',
  'fails',
  'only',
  'sequential',
]);

const SKIPPED_TEST_CALLBACK_MODIFIERS = new Set(['skip', 'todo']);

function isExecutedTestCallbackExpression(expression) {
  const value = unwrapRuntimeValue(expression);
  if (ts.isIdentifier(value)) {
    return EXECUTED_TEST_CALLBACKS.has(value.text);
  }
  if (ts.isCallExpression(value)) {
    return isExecutedTestCallbackExpression(value.expression);
  }
  if (ts.isPropertyAccessExpression(value)) {
    if (SKIPPED_TEST_CALLBACK_MODIFIERS.has(value.name.text)) return false;
    return (
      EXECUTED_TEST_CALLBACK_MODIFIERS.has(value.name.text) &&
      isExecutedTestCallbackExpression(value.expression)
    );
  }
  return false;
}

function registeredTestCallbackCall(node) {
  const parent = node.parent;
  if (
    ts.isCallExpression(parent) &&
    parent.arguments.includes(node) &&
    isExecutedTestCallbackExpression(parent.expression)
  ) {
    return parent;
  }
  return null;
}

function registeredTestCallbackReference(node) {
  return ts.isIdentifier(node) && registeredTestCallbackCall(node);
}

function immediatelyInvokedFunctionCall(node) {
  let expression = node;
  while (ts.isParenthesizedExpression(expression.parent)) {
    expression = expression.parent;
  }
  if (
    ts.isCallExpression(expression.parent) &&
    expression.parent.expression === expression
  ) {
    return expression.parent;
  }
  return null;
}

function functionBindingName(node) {
  if (ts.isFunctionDeclaration(node)) {
    return node.name?.text ?? null;
  }
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    node.parent.initializer === node &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  return null;
}

function functionBindingScope(node, sourceFile) {
  if (ts.isFunctionDeclaration(node)) {
    return nearestLexicalScope(node.parent, sourceFile);
  }
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    node.parent.initializer === node
  ) {
    return variableDeclarationScope(node.parent, sourceFile);
  }
  return null;
}

function isReferenceToFunctionBinding(
  node,
  bindingName,
  bindingScope,
  sourceFile,
  scopedBindingNames
) {
  if (!bindingScope) return false;
  for (let current = node.parent; current; current = current.parent) {
    if (!isLexicalScopeNode(current, sourceFile)) continue;
    if (scopedBindingNames.get(current)?.has(bindingName)) {
      return current === bindingScope;
    }
    if (current === sourceFile) break;
  }
  return false;
}

function isFunctionExecuted(
  node,
  sourceFile,
  seenFunctions = new Set(),
  scopedBindingNames = scopedBindings(sourceFile)
) {
  const registeredCall = registeredTestCallbackCall(node);
  if (registeredCall) {
    return isExecutedRuntimePath(
      registeredCall,
      sourceFile,
      seenFunctions,
      scopedBindingNames
    );
  }
  const immediateCall = immediatelyInvokedFunctionCall(node);
  if (immediateCall) {
    return isExecutedRuntimePath(
      immediateCall,
      sourceFile,
      seenFunctions,
      scopedBindingNames
    );
  }

  const bindingName = functionBindingName(node);
  if (!bindingName || seenFunctions.has(node.pos)) return false;
  const bindingScope = functionBindingScope(node, sourceFile);
  if (!bindingScope) return false;
  const nextSeen = new Set(seenFunctions).add(node.pos);
  let called = false;
  walkAst(sourceFile, candidate => {
    if (
      called ||
      !ts.isIdentifier(candidate) ||
      candidate.text !== bindingName
    ) {
      return;
    }
    if (
      !isReferenceToFunctionBinding(
        candidate,
        bindingName,
        bindingScope,
        sourceFile,
        scopedBindingNames
      )
    ) {
      return;
    }
    if (
      ts.isCallExpression(candidate.parent) &&
      candidate.parent.expression === candidate
    ) {
      called = isExecutedRuntimePath(
        candidate.parent,
        sourceFile,
        nextSeen,
        scopedBindingNames
      );
      return;
    }
    const callbackCall = registeredTestCallbackReference(candidate);
    if (callbackCall) {
      called = isExecutedRuntimePath(
        callbackCall,
        sourceFile,
        nextSeen,
        scopedBindingNames
      );
    }
  });
  return called;
}

function isExecutedRuntimePath(
  node,
  sourceFile,
  seenFunctions = new Set(),
  scopedBindingNames = scopedBindings(sourceFile)
) {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunctionNode(current)) {
      return isFunctionExecuted(
        current,
        sourceFile,
        seenFunctions,
        scopedBindingNames
      );
    }
  }
  return true;
}

function unwrapRuntimeValue(node) {
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

function outerRuntimeValue(node) {
  let current = node;
  while (
    current.parent &&
    ((ts.isParenthesizedExpression(current.parent) &&
      current.parent.expression === current) ||
      (ts.isAsExpression(current.parent) &&
        current.parent.expression === current) ||
      (ts.isSatisfiesExpression(current.parent) &&
        current.parent.expression === current) ||
      (ts.isTypeAssertionExpression(current.parent) &&
        current.parent.expression === current))
  ) {
    current = current.parent;
  }
  return current;
}

function renderedConsumerCall(
  node,
  rendererBindings,
  rootBindings,
  sourceFile,
  scopedBindingNames
) {
  const value = outerRuntimeValue(node);
  const parent = value.parent;
  return ts.isCallExpression(parent) &&
    parent.arguments[0] === value &&
    isRuntimeComponentRenderer(
      parent.expression,
      rendererBindings,
      rootBindings,
      sourceFile,
      scopedBindingNames
    )
    ? parent
    : null;
}

function renderedJsxRoot(node) {
  const parent = node.parent;
  let current = null;
  if (ts.isJsxSelfClosingElement(parent) && parent.tagName === node) {
    current = parent;
  } else if (
    (ts.isJsxOpeningElement(parent) || ts.isJsxClosingElement(parent)) &&
    parent.tagName === node &&
    ts.isJsxElement(parent.parent)
  ) {
    current = parent.parent;
  }
  if (!current) return null;

  while (current.parent) {
    const next = current.parent;
    if (ts.isJsxElement(next) || ts.isJsxFragment(next)) {
      current = next;
      continue;
    }
    if (
      ts.isJsxExpression(next) ||
      ts.isJsxAttribute(next) ||
      ts.isJsxAttributes(next) ||
      ts.isJsxSpreadAttribute(next)
    ) {
      current = next;
      continue;
    }
    if (ts.isFunctionLike(next)) break;

    // A nested JSX value can be wrapped in a conditional, call, or other
    // expression before reaching its containing JSX element. Do not cross a
    // function boundary (a callback returning JSX is not rendered by the
    // outer tree), and do not promote a standalone JSX assignment.
    let hasJsxContext = false;
    for (let probe = next.parent; probe; probe = probe.parent) {
      if (ts.isFunctionLike(probe)) break;
      if (
        ts.isJsxExpression(probe) ||
        ts.isJsxAttribute(probe) ||
        ts.isJsxAttributes(probe) ||
        ts.isJsxSpreadAttribute(probe) ||
        ts.isJsxElement(probe) ||
        ts.isJsxFragment(probe)
      ) {
        hasJsxContext = true;
        break;
      }
    }
    if (!hasJsxContext) break;
    current = next;
  }
  return current;
}

/**
 * A bare identifier reference or inert React element is not executable
 * component evidence. Accept only a direct component call/constructor, or a
 * JSX/createElement value that reaches an imported renderer on an executed
 * top-level/test/helper path.
 */
function isMeaningfulRuntimeComponentUse(
  node,
  { elementFactoryBindings, rendererBindings, rootBindings },
  sourceFile,
  scopedBindingNames
) {
  const parent = node.parent;
  const jsxRoot = renderedJsxRoot(node);
  if (jsxRoot) {
    const renderCall = renderedConsumerCall(
      jsxRoot,
      rendererBindings,
      rootBindings,
      sourceFile,
      scopedBindingNames
    );
    return Boolean(
      renderCall &&
        isExecutedRuntimePath(
          renderCall,
          sourceFile,
          new Set(),
          scopedBindingNames
        )
    );
  }

  if (
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    parent.expression === node
  ) {
    return isExecutedRuntimePath(
      parent,
      sourceFile,
      new Set(),
      scopedBindingNames
    );
  }

  const rendererCall =
    ts.isCallExpression(parent) &&
    parent.arguments[0] === node &&
    isRuntimeComponentRenderer(
      parent.expression,
      rendererBindings,
      rootBindings,
      sourceFile,
      scopedBindingNames
    )
      ? parent
      : null;
  if (rendererCall) {
    return isExecutedRuntimePath(
      rendererCall,
      sourceFile,
      new Set(),
      scopedBindingNames
    );
  }

  const elementFactoryCall =
    ts.isCallExpression(parent) &&
    parent.arguments[0] === node &&
    isRuntimeComponentConsumer(
      parent.expression,
      elementFactoryBindings,
      sourceFile,
      scopedBindingNames
    )
      ? parent
      : null;
  if (!elementFactoryCall) return false;
  const renderCall = renderedConsumerCall(
    elementFactoryCall,
    rendererBindings,
    rootBindings,
    sourceFile,
    scopedBindingNames
  );
  return Boolean(
    renderCall &&
      isExecutedRuntimePath(
        renderCall,
        sourceFile,
        new Set(),
        scopedBindingNames
      )
  );
}

function hasRuntimeImportedUse(sourceFile, importedNames) {
  const allNames = importedNames.map(item => item.localName);
  const names = new Set(allNames);
  const scopedBindingNames = scopedBindings(sourceFile);
  const consumerBindings = {
    elementFactoryBindings: runtimeComponentConsumerBindings(
      sourceFile,
      RUNTIME_COMPONENT_ELEMENT_FACTORY_MODULES
    ),
    rendererBindings: runtimeComponentConsumerBindings(
      sourceFile,
      RUNTIME_COMPONENT_RENDERER_MODULES
    ),
    rootBindings: runtimeComponentConsumerBindings(
      sourceFile,
      RUNTIME_COMPONENT_ROOT_FACTORY_MODULES
    ),
  };
  if (names.size === 0) return false;
  let used = false;
  walkAst(sourceFile, node => {
    if (
      !used &&
      ts.isIdentifier(node) &&
      names.has(node.text) &&
      !isBindingShadowedAt(node, node.text, sourceFile, scopedBindingNames) &&
      isMeaningfulRuntimeComponentUse(
        node,
        consumerBindings,
        sourceFile,
        scopedBindingNames
      )
    ) {
      used = true;
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
    if (nodeReadsExactPath(call)) return true;
    let matches = false;
    const pathArgument = call.arguments[0];
    if (!pathArgument) return false;
    walkAst(pathArgument, node => {
      if (matches) return;
      if (nodeReadsExactPath(node)) matches = true;
    });
    return matches;
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
  sourceFile: providedSourceFile = null,
}) {
  const sourceFile =
    providedSourceFile ?? parseTypeScriptSource(testSource, testRel);
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
  testSourceCache = null,
}) {
  return verifyCoverageVia({
    viaRel,
    componentRel: sourceRel,
    componentBase,
    repoRoot,
    componentSource,
    hasExecutableEvidence: ({
      testSource,
      testRel,
      sourceRel: evidenceSourceRel,
      componentSource: evidenceComponentSource,
    }) => {
      let sourceFile;
      if (testSourceCache) {
        const cached = testSourceCache.get(testRel);
        if (cached?.text === testSource) {
          sourceFile = cached.sourceFile;
        } else {
          sourceFile = parseTypeScriptSource(testSource, testRel);
          testSourceCache.set(testRel, { text: testSource, sourceFile });
        }
      }
      return hasRealLegacyTestEvidence({
        testSource,
        testRel,
        sourceRel: evidenceSourceRel,
        componentSource: evidenceComponentSource,
        sourceFile,
      });
    },
  });
}

export function auditCoverageViaReceipts({ repoRoot = REPO_ROOT } = {}) {
  const seen = new Set();
  const testSourceCache = new Map();
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
        testSourceCache,
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
    // Honor an explicit null/empty diffBase as "no diff base" instead of
    // re-resolving origin/main behind the caller's back. In CI origin/main is
    // always present, so re-resolving turned an explicit opt-out into a diff
    // scan against main (JOV-5454 live-cert contract). `??` would also treat
    // explicit null as missing and fall through to TURBO_SCM_BASE, which
    // times out the 5s control tests on large mechanical PRs (JOV-5466).
    // Only auto-resolve when diffBase is omitted entirely; preserve explicit
    // null so report.diffBase stays null and the skip note is recorded.
    diffBase: Object.hasOwn(options, 'diffBase')
      ? options.diffBase
      : resolveDiffBase(null),
    skipQuality: options.skipQuality ?? false,
    skipRatchet: options.skipRatchet ?? false,
    skipRenderedCert: options.skipRenderedCert ?? false,
    skipLiveStorybook: options.skipLiveStorybook ?? false,
    headSha: options.headSha ?? null,
    comparativeQualificationControls: options.comparativeQualificationControls,
    liveObservations: options.liveObservations,
    liveNodeVersion: options.liveNodeVersion,
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

  // 5) Live Storybook certification (JOV-5454)
  if (!flags.skipLiveStorybook) {
    try {
      const live = runLiveStorybookCertification({
        headSha: flags.headSha ?? undefined,
        observations: flags.liveObservations,
        nodeVersion: flags.liveNodeVersion,
      });
      report.sections.liveStorybookCertification = {
        ok: live.ok,
        schema: live.schema,
        receipt: live.receipt,
      };
      const outcome =
        report.sections.renderedCertification?.receipt?.shadcnOutcome;
      if (outcome && live.receipt?.liveVisualCertification) {
        outcome.liveVisualCertification = live.receipt.liveVisualCertification;
      }
      if (!live.ok) report.ok = false;
    } catch (error) {
      report.sections.liveStorybookCertification = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
      report.ok = false;
    }
  } else {
    report.sections.liveStorybookCertification = { ok: true, skipped: true };
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
        `[component-ship-gate] shadcn-outcome rubric: ${outcome.ok ? 'qualified' : 'FAIL'} enrolled=${(outcome.enrolled ?? []).length} live-visual=${outcome.liveVisualCertification?.status ?? 'unknown'}`
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

  const live = report.sections.liveStorybookCertification;
  if (live?.skipped) {
    console.log('[component-ship-gate] live-storybook-cert: skipped');
  } else if (live?.ok) {
    const head = live.receipt?.headSha ?? 'unknown';
    console.log(`[component-ship-gate] live-storybook-cert: ok head=${head}`);
    for (const item of live.receipt?.observations ?? []) {
      console.log(`  live ${item.id}: ${item.verdict}`);
    }
  } else {
    console.error('[component-ship-gate] live-storybook-cert: FAIL');
    if (live?.message) console.error(live.message);
    for (const issue of live?.receipt?.issues ?? []) {
      console.error(`- ${issue}`);
    }
  }

  if (report.ok) {
    console.log('[component-ship-gate] PASS');
  } else {
    console.error(
      '[component-ship-gate] FAIL — shippable UI components require matching tests + stories + rendered certification + live Storybook certification (JOV-4421, JOV-5400, JOV-5438, JOV-5454)'
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
  --skip-live-storybook  Skip live Storybook certification
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
    skipLiveStorybook: flags.skipLiveStorybook,
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
