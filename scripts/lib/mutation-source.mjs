import ts from 'typescript';

/** Parse source with the pinned compiler, rejecting incomplete parser evidence.
 * @param {string} path
 * @param {string} contents
 */
export function parseModule(path, contents) {
  const tree = ts.createSourceFile(
    path,
    contents,
    ts.ScriptTarget.Latest,
    true
  );
  // The compiler exposes diagnostics at runtime but omits this public type.
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
 * Exclude only erased declarations and static re-export wiring. Re-exports
 * still load runtime dependencies: import-graph traversal must retain them.
 * Missing, malformed, or other runtime source remains selected and must pass
 * the normal execution/report checks; zero mutants alone never prove a skip.
 * @param {string} path
 * @param {string} contents
 */
export function hasMutationSource(path, contents) {
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
        (statement.moduleSpecifier &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          !statement.modifiers?.length &&
          !statement.attributes) ||
        (!statement.moduleSpecifier &&
          clause &&
          ts.isNamedExports(clause) &&
          clause.elements.length === 0)
      );
    }
    return true;
  });
}

// Evidence views and scoring share the existing lightweight mutation import boundary.
/** @typedef {{ imports: { specifier: string, actual: boolean }[], mocks: string[], unmocks: string[], unresolved: boolean, unresolvedExpressions: string[] }} RuntimeEdges */

/**
 * @param {(sourcePath: string) => string[]} selectTarget
 * @param {(path: string) => RuntimeEdges | null} module
 * @param {(specifier: string, importer: string) => string | null} resolve
 * @param {Map<string, string>} tests
 */
export function withMutationEvidence(selectTarget, module, resolve, tests) {
  /** @param {string} path */
  const select = path => selectTarget(path);
  /** @type {Map<string, string[]>} */
  const closures = new Map();
  /** @param {string} start @param {boolean} [test] */
  const closure = (start, test = false) => {
    const key = `${test}:${start}`;
    if (test && !tests.has(start))
      throw new Error(`Mutation test is missing: ${start}`);
    if (closures.has(key)) return closures.get(key) ?? [];
    const root = module(start);
    const actual = new Set(root?.unmocks.map(s => resolve(s, start)));
    const mocked = new Set(
      test
        ? root?.mocks.map(s => resolve(s, start)).filter(p => !actual.has(p))
        : []
    );
    const visited = new Set();
    const pending = [start];
    for (let i = 0; i < pending.length; i++) {
      const path = pending[i];
      if (visited.has(path)) continue;
      visited.add(path);
      for (const edge of module(path)?.imports ?? []) {
        const target = resolve(edge.specifier, path);
        if (target && (!mocked.has(target) || edge.actual))
          pending.push(target);
      }
    }
    const paths = [...visited].sort();
    closures.set(key, paths);
    return paths;
  };
  /** Selected runtime byte inputs; existing moduleKey identity is unchanged.
   * @param {string} source @param {string[]} selectedTests */
  select.inputs = (source, selectedTests) => {
    if (!module(source))
      throw new Error(`Mutation source is missing: ${source}`);
    const inputs = new Set(closure(source));
    for (const test of selectedTests)
      for (const path of closure(test, true)) inputs.add(path);
    return [...inputs].sort();
  };
  /** @param {string} source @param {string[]} selectedTests */
  select.unresolved = (source, selectedTests) =>
    select
      .inputs(source, selectedTests)
      .filter(path => module(path)?.unresolved);
  /** @param {string} source @param {string[]} selectedTests */
  select.unresolvedDetails = (source, selectedTests) =>
    select.unresolved(source, selectedTests).map(path => ({
      path,
      expressions: module(path)?.unresolvedExpressions ?? [],
    }));
  /** @type {{ testPaths: string[], modules: ({ path: string } & RuntimeEdges)[] } | null} */
  let inventory = null;
  // Bind selection rewires without invalidating all scores for unrelated assertion edits.
  select.inventory = () => {
    if (inventory) return inventory;
    const testPaths = [...tests.keys()].sort();
    const paths = new Set();
    for (const test of testPaths)
      for (const path of closure(test, true)) paths.add(path);
    const modules = [...paths].sort().map(path => {
      const {
        imports = [],
        mocks = [],
        unmocks = [],
        unresolved = false,
        unresolvedExpressions = [],
      } = module(path) ?? {};
      return {
        path,
        unresolved,
        unresolvedExpressions,
        imports: [...imports].sort(
          (a, b) =>
            a.specifier.localeCompare(b.specifier) ||
            Number(a.actual) - Number(b.actual)
        ),
        mocks: [...new Set(mocks)].sort(),
        unmocks: [...new Set(unmocks)].sort(),
      };
    });
    inventory = { testPaths, modules };
    return inventory;
  };
  return select;
}

export { scoreMutants } from './mutation-score-math.mjs';
