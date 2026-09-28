// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Invariant (JOV-6702): TanStack Virtual returns fresh rows and sizes from a
 * stable `virtualizer` object. React Compiler caches reads keyed on that object,
 * so a compiled component or hook that reads them renders a stale window: the
 * Ovie transcript went blank and tables flickered on scroll. Any function the
 * compiler memoizes must not read virtualizer state; opt it out with
 * 'use no memo'.
 */
const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/core') as {
  transformSync(
    code: string,
    options: Record<string, unknown>
  ): { code?: string | null } | null;
};

const WEB_ROOT = path.resolve(__dirname, '../../..');
const SCAN_ROOTS = ['app', 'components', 'hooks', 'lib'];
const USES_VIRTUAL = /useVirtualizer\(|\.getVirtualItems\(|\.getTotalSize\(/;
const LIVE_READS = new Set([
  'getVirtualItems',
  'getTotalSize',
  'getVirtualIndexes',
]);

type BabelPath = {
  node: {
    type: string;
    id?: { name?: string } | null;
    callee?: {
      type: string;
      name?: string;
      property?: { type: string; name?: string };
    };
  };
  parent: { type: string; id?: { name?: string } };
  getFunctionParent(): BabelPath | null;
  traverse(visitor: Record<string, (path: BabelPath) => void>): void;
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec|stories)\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

function functionName(fn: BabelPath): string {
  return (
    fn.node.id?.name ??
    (fn.parent.type === 'VariableDeclarator'
      ? fn.parent.id?.name
      : undefined) ??
    '<anonymous>'
  );
}

/** Compiled (memoized) functions in `file` that read live virtualizer state. */
function compiledVirtualizerReaders(file: string): {
  compiled: number;
  offenders: string[];
} {
  const offenders: string[] = [];
  let compiled = 0;
  const inspect = () => ({
    visitor: {
      Program: {
        exit(program: BabelPath) {
          program.traverse({
            CallExpression(call: BabelPath) {
              const callee = call.node.callee;
              if (
                callee?.type !== 'Identifier' ||
                !/^_c\d*$/.test(callee.name ?? '')
              )
                return;
              const fn = call.getFunctionParent();
              if (!fn) return;
              compiled += 1;
              let readsLiveState = false;
              fn.traverse({
                CallExpression(inner: BabelPath) {
                  const property = inner.node.callee?.property;
                  if (
                    inner.node.callee?.type === 'MemberExpression' &&
                    property?.type === 'Identifier' &&
                    LIVE_READS.has(property.name ?? '')
                  )
                    readsLiveState = true;
                },
              });
              if (readsLiveState) offenders.push(functionName(fn));
            },
          });
        },
      },
    },
  });
  babel.transformSync(readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    plugins: [
      [require.resolve('babel-plugin-react-compiler'), {}],
      inspect,
      require.resolve('next/dist/compiled/babel/plugin-syntax-jsx'),
      [
        require.resolve('next/dist/compiled/babel/plugin-syntax-typescript'),
        { isTSX: file.endsWith('.tsx') },
      ],
    ],
  });
  return { compiled, offenders };
}

const VIRTUALIZED_FILES = SCAN_ROOTS.flatMap(root =>
  sourceFiles(path.join(WEB_ROOT, root))
)
  .filter(file => USES_VIRTUAL.test(readFileSync(file, 'utf8')))
  .map(file => path.relative(WEB_ROOT, file));

describe('virtualizer reads under React Compiler', { timeout: 60_000 }, () => {
  it('finds the virtualized surfaces', () => {
    expect(VIRTUALIZED_FILES).toEqual(
      expect.arrayContaining([
        'components/jovie/JovieChatSections.tsx',
        'components/organisms/table/organisms/useTableVirtualization.ts',
      ])
    );
  });

  it.each(VIRTUALIZED_FILES)('%s keeps virtualizer reads uncompiled', file => {
    expect(
      compiledVirtualizerReaders(path.join(WEB_ROOT, file)).offenders
    ).toEqual([]);
  });

  it('detects a compiled reader, so the invariant cannot pass vacuously', () => {
    const fixture = path.join(
      __dirname,
      '__fixtures__/compiled-virtual-rows.tsx'
    );
    expect(compiledVirtualizerReaders(fixture)).toEqual({
      compiled: 1,
      offenders: ['CompiledRows'],
    });
  });
});
