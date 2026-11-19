import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASELINE_PATH,
  compare,
  countSource,
  isScanned,
  scan,
  shrink,
} from './type-safety-ratchet.mjs';

test('counts every escape category with the AST', () => {
  const counts = countSource(
    [
      'const a = foo() as unknown as Bar;',
      'const b = cfg!.host;',
      '// @ts-ignore',
      '// @ts-expect-error later',
      'let c: any = 1;',
      'const d = x as any;',
      'const e: any[] = [];',
      'const ok = foo !== bar;',
      'const single = foo() as unknown;',
      'const word = anyminded;',
    ].join('\n'),
    'apps/x/sample.ts'
  );
  assert.deepEqual(counts, {
    'as-unknown-as': 1,
    'non-null': 1,
    'ts-ignore': 2,
    any: 3,
  });
});

test('parses tsx sources, including JSX', () => {
  const counts = countSource(
    'export const A = () => <div>{items![0]}<span>{v as unknown as string}</span></div>;',
    'apps/x/a.tsx'
  );
  assert.deepEqual(counts, {
    'as-unknown-as': 1,
    'non-null': 1,
    'ts-ignore': 0,
    any: 0,
  });
});

test('scope: app/package/worker sources in, tests, declarations, generated and drizzle out', () => {
  const scanned = [
    'apps/web/lib/x.ts',
    'apps/web/components/a/b.tsx',
    'apps/web/components/a/b.stories.tsx',
    'packages/ui/src/c.ts',
    'workers/cron-hub/src/d.tsx',
  ];
  for (const file of scanned) assert.ok(isScanned(file), file);
  const outside = [
    'scripts/invariants/type-safety-ratchet.mjs',
    'docs/x.ts',
    'apps/web/x.test.ts',
    'apps/web/x.test.tsx',
    'apps/web/x.spec.ts',
    'apps/web/x.d.ts',
    'packages/ui/src/__tests__/x.ts',
    'apps/web/styles/generated/x.ts',
    'apps/web/lib/chat/skills/index.generated.ts',
    'apps/web/drizzle/migrations/0001_x.ts',
    'apps/web/node_modules/pkg/x.ts',
  ];
  for (const file of outside) assert.ok(!isScanned(file), file);
});

test('ratchet: unchanged passes, increase fails, new file fails, decrease passes with a shrink hint', () => {
  const ledger = {
    'apps/a.ts': { 'non-null': 2, any: 1 },
    'apps/gone.ts': { 'as-unknown-as': 3 },
  };
  const unchanged = { 'apps/a.ts': { 'non-null': 2, any: 1 } };
  assert.deepEqual(compare(unchanged, ledger).violations, []);
  assert.deepEqual(
    compare(unchanged, ledger).shrinkable.map(s => s.file),
    ['apps/gone.ts']
  );

  const decreased = { 'apps/a.ts': { 'non-null': 1, any: 1 } };
  assert.deepEqual(compare(decreased, ledger).violations, []);
  assert.deepEqual(
    compare(decreased, ledger).shrinkable.map(s => s.file),
    ['apps/a.ts', 'apps/gone.ts']
  );

  const grown = { 'apps/a.ts': { 'non-null': 3, any: 1 } };
  assert.deepEqual(
    compare(grown, ledger).violations.map(v => v.category),
    ['non-null']
  );

  const fresh = { 'apps/new.ts': { any: 1 } };
  const newFile = compare(fresh, ledger).violations;
  assert.equal(newFile.length, 1);
  assert.equal(newFile[0].file, 'apps/new.ts');
  assert.equal(newFile[0].allowed, 0);
});

test('shrink only lowers, never adds files or rows, and drops zeroed rows', () => {
  const found = {
    'apps/a.ts': { 'non-null': 1 },
    'apps/new.ts': { any: 9 },
  };
  const next = shrink(found, {
    'apps/a.ts': { 'non-null': 2, any: 1 },
    'apps/gone.ts': { 'as-unknown-as': 3 },
  });
  assert.deepEqual(next, { 'apps/a.ts': { 'non-null': 1 } });
});

test('scan reads only in-scope files and reports per-file nonzero counts', () => {
  const files = {
    'apps/a.ts': 'const x = y as unknown as Z;',
    'apps/b.test.ts': 'const x = y as unknown as Z;',
    'packages/c.ts': 'const y = z!;',
  };
  assert.deepEqual(
    scan(Object.keys(files), p => files[p]),
    {
      'apps/a.ts': { 'as-unknown-as': 1 },
      'packages/c.ts': { 'non-null': 1 },
    }
  );
});

test('baseline ledger path is committed next to this test', () => {
  assert.equal(
    BASELINE_PATH,
    'scripts/invariants/type-safety-ratchet.baseline.json'
  );
});
