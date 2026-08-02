#!/usr/bin/env node
/**
 * Hard component ship gate (JOV-4421).
 *
 * Fail closed when a shippable UI component is added/changed without:
 *   1. Matching unit/interaction test (colocated or verified @coverage-via)
 *   2. Matching Storybook story that imports the real component
 *   3. Static match checks (required props / state matrix hints)
 *   4. Story quality hygiene (no pure-black voids / fake CTAs)
 *   5. Multi-root story-coverage ratchet (lock_up + no uncovered growth)
 *
 * Usage:
 *   pnpm component-ship-gate
 *   node scripts/component-ship-gate.mjs [--diff-base=origin/main] [--skip-quality] [--skip-ratchet]
 *
 * Env:
 *   COMPONENT_SHIP_DIFF_BASE / STORY_COVERAGE_DIFF_BASE / TURBO_SCM_BASE / GITHUB_BASE_REF
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  checkStoryMatchesComponent,
  extractExportedComponentNames,
  isUnderShipScope,
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
    json: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--diff-base='))
      flags.diffBase = arg.slice('--diff-base='.length);
    else if (arg === '--skip-quality') flags.skipQuality = true;
    else if (arg === '--skip-ratchet') flags.skipRatchet = true;
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

function shadowedBindingNames(sourceFile, importedNames) {
  const candidates = new Set(importedNames);
  const shadowed = new Set();
  walkAst(sourceFile, node => {
    let bindingName = null;
    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node)
    ) {
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

function isTypeOrImportUse(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isImportDeclaration(current) || ts.isTypeNode(current)) return true;
    if (ts.isStatement(current)) return false;
  }
  return false;
}

function hasRuntimeImportedUse(sourceFile, importedNames) {
  const allNames = importedNames.map(item => item.localName);
  const shadowedNames = shadowedBindingNames(sourceFile, allNames);
  const names = new Set(allNames.filter(name => !shadowedNames.has(name)));
  if (names.size === 0) return false;
  let used = false;
  walkAst(sourceFile, node => {
    if (
      !used &&
      ts.isIdentifier(node) &&
      names.has(node.text) &&
      !isTypeOrImportUse(node)
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

function hasExplicitSourceRead(sourceFile, sourceRel) {
  const readBindings = nodeFsReadBindings(sourceFile);
  if (readBindings.direct.size === 0 && readBindings.namespace.size === 0) {
    return false;
  }
  const exactPaths = new Set([
    sourceRel,
    sourceRel.replace(/^apps\/web\//, ''),
  ]);
  const pathBindings = new Set();
  walkAst(sourceFile, node => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) return;
    const value = unwrapStringLiteral(node.initializer);
    if (value && exactPaths.has(value)) pathBindings.add(node.name.text);
  });

  const callReadsExactPath = call => {
    let matches = false;
    for (const argument of call.arguments) {
      walkAst(argument, node => {
        if (matches) return;
        const literal = unwrapStringLiteral(node);
        if (literal && exactPaths.has(literal)) matches = true;
        if (ts.isIdentifier(node) && pathBindings.has(node.text))
          matches = true;
      });
    }
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
        isReadFileSyncCall(child, readBindings) &&
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
        isReadFileSyncCall(child, readBindings) &&
        callReadsExactPath(child)
      ) {
        assertedReadBinding = true;
      }
    });
  });
  return assertedReadBinding;
}

function hasRealLegacyTestEvidence({
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
      const verified = verifyCoverageVia({
        viaRel,
        componentRel: sourceRel,
        componentBase: base,
        repoRoot,
      });
      if (verified.ok) {
        testOk = true;
        resolvedTest = viaRel;
      } else {
        issues.push({
          path: sourceRel,
          rule: 'coverage-via-invalid',
          detail: verified.detail,
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

  if (report.ok) {
    console.log('[component-ship-gate] PASS');
  } else {
    console.error(
      '[component-ship-gate] FAIL — shippable UI components require matching tests + stories (JOV-4421)'
    );
  }
}

function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  if (flags.help) {
    console.log(`Usage: node scripts/component-ship-gate.mjs [options]
  --diff-base=<ref>   Git base for changed-file detection (default: origin/main)
  --skip-quality      Skip storybook quality guard
  --skip-ratchet      Skip multi-root story coverage ratchet
  --json              Print machine-readable report`);
    return 0;
  }

  const report = runComponentShipGate({
    diffBase: flags.diffBase ?? resolveDiffBase(null),
    skipQuality: flags.skipQuality,
    skipRatchet: flags.skipRatchet,
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
