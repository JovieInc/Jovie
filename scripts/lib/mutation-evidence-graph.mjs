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
