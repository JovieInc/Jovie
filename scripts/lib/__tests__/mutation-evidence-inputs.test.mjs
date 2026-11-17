import { describe, expect, it } from 'vitest';
import { createTestSelector } from '../mutation-diff.mjs';

const selector = (tests, modules) =>
  createTestSelector(tests, p => modules.get(p) ?? null);
describe('selected mutation evidence inputs', () => {
  it('binds helpers and actual imports, excludes mocks, and handles cycles', () => {
    const modules = new Map([
      ['a.ts', "export { yes } from './b';"],
      ['b.ts', "export { yes } from './c';"],
      ['c.ts', "import './a'; export const yes = value => value === 1;"],
      ['real.ts', 'export const actual = 1;'],
      ['mock.ts', 'throw new Error("must be mocked");'],
      ['assert.ts', "export { input } from './data';"],
      ['data.ts', 'export const input = 1;'],
      ['other.ts', 'export const other = 0;'],
    ]);
    const tests = new Map([
      [
        'a.test.ts',
        `import './a'; import './assert';
        vi.mock('./mock', () => ({})); import './mock';
        vi.mock('./real', () => ({})); vi.importActual('./real');`,
      ],
      ['other.test.ts', "import './other';"],
    ]);
    const reads = new Map();
    const select = createTestSelector(tests, path => {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return modules.get(path) ?? null;
    });
    const expected = 'a.test.ts a.ts assert.ts b.ts c.ts data.ts real.ts'.split(
      ' '
    );
    const inputs = () => select.inputs('a.ts', ['a.test.ts']);
    expect(inputs()).toEqual(expected);
    expect(inputs()).toEqual(expected);
    expect(Math.max(...reads.values())).toBe(1);
    expect(reads.has('other.ts')).toBe(false);
  });
  it('fails closed when a selected test or source is missing', () => {
    const select = createTestSelector(new Map([['a.test.ts', 'export {};']]));
    expect(() => select.inputs('missing', ['a.test.ts'])).toThrow(
      /source.*missing/iu
    );
    expect(() => select.inputs('a.test.ts', ['missing'])).toThrow(
      /test.*missing/iu
    );
  });
  it('changes inventory for rewired helpers and new tests, not assertions', () => {
    const inventory = (n = 1, helper = '', extra = false) => {
      const tests = new Map([
        ['a.test.ts', `import './helper'; expect(${n}).toBe(${n});`],
      ]);
      if (extra) tests.set('new.test.ts', 'export {};');
      return selector(
        tests,
        new Map([
          ['helper.ts', helper],
          ['a.ts', 'export const value = 1;'],
        ])
      ).inventory();
    };
    const initial = inventory();
    expect(inventory(2)).toEqual(initial);
    expect(inventory(1, "import './a';")).not.toEqual(initial);
    expect(inventory(1, '', true)).not.toEqual(initial);
    expect(initial.testPaths).toEqual(['a.test.ts']);
    expect(initial.modules.map(row => row.path)).toEqual([
      'a.test.ts',
      'helper.ts',
    ]);
  });
  it('exposes unresolved computed imports instead of claiming a closed graph', () => {
    for (const call of [
      'import(name)',
      'require(name)',
      'vi.importActual(name)',
    ]) {
      const tests = new Map([['a.test.ts', "import './a';"]]);
      const modules = new Map([
        ['a.ts', `export const lazy = name => ${call};`],
      ]);
      const select = selector(tests, modules);
      expect(select.unresolved('a.ts', [...tests.keys()])).toEqual(['a.ts']);
      expect(select.unresolvedDetails('a.ts', [...tests.keys()])).toEqual([
        { path: 'a.ts', expressions: ['name'] },
      ]);
      expect(
        select.inventory().modules.find(row => row.path === 'a.ts')?.unresolved
      ).toBe(true);
    }
  });
  it('retains an extra computed dependency beside a known config expression', () => {
    const known =
      "pathToFileURL(path.resolve(workspaceRoot, 'scripts/lib/vitest-retry-reporter.mjs')).href";
    const modules = new Map([
      ['config.ts', `await import(${known}); await import(extra);`],
    ]);
    const select = selector(new Map(), modules);
    expect(select.unresolvedDetails('config.ts', [])).toEqual([
      { path: 'config.ts', expressions: [known, 'extra'] },
    ]);
  });
});
