import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'vitest';
import {
  componentRenderBindings,
  RENDER_INPUT_SCHEMA_V2,
  readStorybookAliases,
} from '../component-render-closure.mjs';
import {
  reusableReceipts,
  shardCount,
} from '../component-story-evidence-lib.mjs';

const owned = new Set();
const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);
afterEach(() => {
  for (const path of owned) rmSync(path, { recursive: true, force: true });
  owned.clear();
});

const BUTTON = 'packages/ui/atoms/button.tsx';
const CARD = 'apps/web/components/card.tsx';
const ROW = 'apps/web/components/row.tsx';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'render-closure-'));
  owned.add(root);
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  execFileSync('git', ['init', '--quiet'], { cwd: root, env: gitEnv });
  for (const [path, text] of Object.entries({
    'package.json': '{}',
    'pnpm-lock.yaml': 'lockfileVersion: 9',
    'apps/web/package.json': '{"name":"web"}',
    'apps/web/tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '@/*': ['./*'] } },
    }),
    'apps/web/app/globals.css': 'body { color: red }',
    'apps/web/.storybook/main.ts': `export default { viteFinal: c => ({ ...c, resolve: { alias: [
      { find: 'next/navigation', replacement: require.resolve('./mocks/navigation') },
    ] } }) };`,
    'apps/web/.storybook/mocks/navigation.ts':
      'export const useRouter = () => ({});',
    'apps/web/.storybook/preview.tsx':
      "import '../app/globals.css';\nexport default {};",
    'packages/ui/package.json': JSON.stringify({
      name: '@jovie/ui',
      exports: { '.': './index.ts', './atoms/*': './atoms/*.tsx' },
    }),
    'packages/ui/index.ts': "export { Button } from './atoms/button';",
    [BUTTON]:
      "import { cn } from '../lib/cn';\nexport const Button = () => cn();",
    'packages/ui/lib/cn.ts': 'export const cn = () => "";',
    'packages/ui/atoms/button.stories.tsx':
      "import { Button } from './button';\nexport default { component: Button };",
    [CARD]:
      "import { Button } from '@jovie/ui/atoms/button';\nimport { Row } from '@/components/row';\nimport { useRouter } from 'next/navigation';\nexport const Card = () => [Button, Row, useRouter];",
    [ROW]: "import clsx from 'clsx';\nexport const Row = () => clsx();",
    'apps/web/components/card.stories.tsx':
      "import { Card } from './card';\nimport { fixture } from './card.fixture';\nexport default { component: Card, args: fixture };",
    'apps/web/components/card.fixture.ts': 'export const fixture = {};',
  }))
    put(path, text);
  execFileSync('git', ['add', '.'], { cwd: root, env: gitEnv });
  const bind = () => {
    const result = componentRenderBindings(root, [BUTTON, CARD, ROW]);
    assert.equal(result.problem, null);
    return result;
  };
  return { root, put, bind };
}

const digests = ({ bindings }) =>
  Object.fromEntries([...bindings].map(([path, b]) => [path, b.digest]));

describe('per-component render closure (jovie.component-render-inputs/v2)', () => {
  it('binds each component to its own imports, story files and Storybook mocks', () => {
    const f = fixture();
    const result = f.bind();
    assert.equal(result.stats.global, 0);
    for (const b of result.bindings.values()) {
      assert.equal(b.schema, RENDER_INPUT_SCHEMA_V2);
      assert.equal(b.scope, 'closure');
      assert.match(b.digest, /^[0-9a-f]{64}$/);
    }
    const before = digests(result);

    // A file only Row imports moves Row and Card, never Button.
    f.put(ROW, "import clsx from 'clsx';\nexport const Row = () => clsx('x');");
    let after = digests(f.bind());
    assert.notEqual(after[ROW], before[ROW]);
    assert.notEqual(after[CARD], before[CARD]);
    assert.equal(after[BUTTON], before[BUTTON]);

    // A story's own fixture belongs to that component alone.
    f.put(
      'apps/web/components/card.fixture.ts',
      'export const fixture = { a: 1 };'
    );
    const fixtureMoved = digests(f.bind());
    assert.notEqual(fixtureMoved[CARD], after[CARD]);
    assert.equal(fixtureMoved[ROW], after[ROW]);
    after = fixtureMoved;

    // A Storybook alias mock is a dependency of the importer only.
    f.put(
      'apps/web/.storybook/mocks/navigation.ts',
      'export const useRouter = () => null;'
    );
    const mocked = digests(f.bind());
    assert.notEqual(mocked[CARD], after[CARD]);
    assert.equal(mocked[BUTTON], after[BUTTON]);
    after = mocked;

    // Shared inputs (global CSS, the preview, lockfile) move everything.
    f.put('apps/web/app/globals.css', 'body { color: blue }');
    const shared = digests(f.bind());
    for (const path of [BUTTON, CARD, ROW])
      assert.notEqual(shared[path], after[path]);

    // So does the capture code: a new producer re-proves every receipt.
    f.put('.github/workflows/visual-a11y.yml', 'name: Visual');
    execFileSync('git', ['add', '.'], { cwd: f.root, env: gitEnv });
    const producer = digests(f.bind());
    for (const path of [BUTTON, CARD, ROW])
      assert.notEqual(producer[path], shared[path]);
  });

  it('falls back to the global digest when an import cannot be resolved', () => {
    const f = fixture();
    f.put(
      ROW,
      "import { Gone } from '@/components/gone';\nexport const Row = () => Gone;"
    );
    execFileSync('git', ['add', '.'], { cwd: f.root, env: gitEnv });
    const result = f.bind();
    assert.equal(result.bindings.get(ROW).scope, 'global');
    assert.equal(result.bindings.get(CARD).scope, 'global');
    assert.equal(result.bindings.get(BUTTON).scope, 'closure');
    assert.ok(result.stats.unresolved.some(u => String(u).includes('gone')));
  });

  it('falls back to the global digest on a dynamic import', () => {
    const f = fixture();
    f.put(ROW, 'export const Row = name => import(name);');
    const result = f.bind();
    assert.equal(result.bindings.get(ROW).scope, 'global');
    assert.equal(result.bindings.get(BUTTON).scope, 'closure');
  });

  it('reads every Storybook alias mock or refuses', () => {
    const f = fixture();
    const aliases = readStorybookAliases(f.root);
    assert.deepEqual(
      aliases.map(a => a.file),
      ['apps/web/.storybook/mocks/navigation']
    );
    assert.ok(aliases[0].matches('next/navigation'));
    assert.ok(!aliases[0].matches('next/link'));
    f.put(
      'apps/web/.storybook/main.ts',
      "export default { alias: [{ replacement: require.resolve('./mocks/navigation') }] };"
    );
    assert.throws(() => readStorybookAliases(f.root));
  });
});

describe('story evidence reuse and sharding', () => {
  const inputs = new Map([
    [
      BUTTON,
      {
        sourceHash: 'a',
        renderInputs: { schema: RENDER_INPUT_SCHEMA_V2, digest: 'd1' },
      },
    ],
    [
      CARD,
      {
        sourceHash: 'b',
        renderInputs: { schema: RENDER_INPUT_SCHEMA_V2, digest: 'd2' },
      },
    ],
  ]);
  const receipt = (sourceHash, digest, status = 'pass') => ({
    schema: 'jovie.component-story-evidence/v1',
    status,
    sourceHash,
    renderInputs: { schema: RENDER_INPUT_SCHEMA_V2, digest },
  });

  it('reuses only receipt pairs whose source and closure still match', () => {
    const reused = reusableReceipts(
      {
        visual: { [BUTTON]: receipt('a', 'd1'), [CARD]: receipt('b', 'old') },
        a11y: {
          [BUTTON]: receipt('a', 'd1', 'fail'),
          [CARD]: receipt('b', 'd2'),
        },
      },
      inputs
    );
    assert.deepEqual([...reused.keys()], [BUTTON]);
    assert.equal(reused.get(BUTTON).a11y.status, 'fail');
    // A failure that may be a flake (no render, errors) is captured again.
    const flaky = { ...receipt('a', 'd1', 'fail'), retry: true };
    assert.equal(
      reusableReceipts(
        { visual: { [BUTTON]: receipt('a', 'd1') }, a11y: { [BUTTON]: flaky } },
        inputs
      ).size,
      0
    );
    // A half pair is recaptured.
    assert.equal(
      reusableReceipts(
        { visual: { [BUTTON]: receipt('a', 'd1') }, a11y: {} },
        inputs
      ).size,
      0
    );
  });

  it('sizes shards by render count within the cap', () => {
    assert.equal(shardCount(0), 0);
    assert.equal(shardCount(1), 1);
    assert.equal(shardCount(800, 20, 400), 2);
    assert.equal(shardCount(9472, 20, 400), 20);
  });
});
