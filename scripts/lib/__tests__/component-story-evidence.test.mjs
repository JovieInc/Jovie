import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  acceptStoryReceipts,
  STORY_EVIDENCE_SCHEMA,
} from '../component-evidence.mjs';
import {
  assembleEvidence,
  captureProblems,
  componentForStoryFile,
  mergeEvidence,
  parseShard,
  repoPathForImport,
  runnerRefusal,
  selectUiStories,
  shardComponents,
  storyUrl,
} from '../component-story-evidence-lib.mjs';

const COMPONENTS = [
  'packages/ui/atoms/button.tsx',
  'packages/ui/atoms/card.tsx',
  'packages/ui/atoms/dialog.tsx',
  'packages/ui/atoms/alert-dialog.tsx',
  'packages/ui/confirm-dialog.tsx',
];
const hashA = 'a'.repeat(64);
const shot = 'b'.repeat(64);
const clean = (storyId, theme, extra = {}) => ({
  storyId,
  theme,
  rendered: true,
  appliedTheme: theme,
  errors: [],
  violations: [],
  screenshotSha256: shot,
  ...extra,
});
const both = (storyId, extra = {}) => [
  clean(storyId, 'light', extra.light),
  clean(storyId, 'dark', extra.dark),
];
const one = (path, storyIds) =>
  new Map([
    [
      path,
      {
        sourceHash: hashA,
        storyIds,
        renderInputs: {
          schema: 'jovie.component-render-inputs/v1',
          digest: hashA,
          mode: 'storybook-full',
        },
      },
    ],
  ]);

describe('runner guard: Storybook never runs on gem', () => {
  it('allows GitHub-hosted runners', () => {
    assert.equal(runnerRefusal({ RUNNER_ENVIRONMENT: 'github-hosted' }), null);
  });
  it('refuses a self-hosted runner even with --local', () => {
    assert.match(
      runnerRefusal({ RUNNER_ENVIRONMENT: 'self-hosted' }, { local: true }),
      /self-hosted/
    );
  });
  it('allows --local only off CI', () => {
    assert.equal(runnerRefusal({}, { local: true }), null);
    assert.ok(runnerRefusal({}));
    assert.ok(runnerRefusal({ GITHUB_ACTIONS: 'true' }, { local: true }));
  });
});

describe('story to component mapping', () => {
  it('resolves Storybook import paths from apps/web or the repo root', () => {
    assert.equal(
      repoPathForImport('../../packages/ui/atoms/button.stories.tsx'),
      'packages/ui/atoms/button.stories.tsx'
    );
    assert.equal(
      repoPathForImport('./packages/ui/atoms/button.stories.tsx'),
      'packages/ui/atoms/button.stories.tsx'
    );
    assert.equal(repoPathForImport('../components/atoms/x.stories.tsx'), null);
    assert.equal(repoPathForImport('../../../packages/ui/x.stories.tsx'), null);
    assert.equal(repoPathForImport(undefined), null);
  });
  it('maps a story file and its companion to the same component', () => {
    for (const file of [
      'packages/ui/atoms/button.stories.tsx',
      'packages/ui/atoms/button.states.stories.tsx',
      'packages/ui/atoms/button.a11y.states.stories.tsx',
    ])
      assert.equal(
        componentForStoryFile(file, COMPONENTS),
        'packages/ui/atoms/button.tsx'
      );
  });
  it('matches case-insensitively, within the directory, longest base first', () => {
    assert.equal(
      componentForStoryFile('packages/ui/atoms/Card.stories.tsx', COMPONENTS),
      'packages/ui/atoms/card.tsx'
    );
    assert.equal(
      componentForStoryFile(
        'packages/ui/atoms/alert-dialog.stories.tsx',
        COMPONENTS
      ),
      'packages/ui/atoms/alert-dialog.tsx'
    );
    assert.equal(
      componentForStoryFile(
        'packages/ui/confirm-dialog.stories.tsx',
        COMPONENTS
      ),
      'packages/ui/confirm-dialog.tsx'
    );
    assert.equal(
      componentForStoryFile('packages/ui/brand/button.stories.tsx', COMPONENTS),
      null
    );
    assert.equal(
      componentForStoryFile('packages/ui/atoms/button.tsx', COMPONENTS),
      null
    );
  });
  it('selects packages/ui stories, skips docs and other roots, reports orphans', () => {
    const index = {
      v: 5,
      entries: {
        'b--docs': {
          type: 'docs',
          id: 'b--docs',
          importPath: '../../packages/ui/atoms/button.stories.tsx',
        },
        'b--z': {
          type: 'story',
          id: 'b--z',
          importPath: '../../packages/ui/atoms/button.stories.tsx',
        },
        'b--a': {
          type: 'story',
          id: 'b--a',
          importPath: '../../packages/ui/atoms/button.states.stories.tsx',
        },
        'w--a': {
          type: 'story',
          id: 'w--a',
          importPath: '../components/atoms/thing.stories.tsx',
        },
        'o--a': {
          type: 'story',
          id: 'o--a',
          importPath: '../../packages/ui/brand/JovieO.stories.tsx',
        },
      },
    };
    const { components, unmapped } = selectUiStories(index, COMPONENTS);
    assert.deepEqual(
      [...components],
      [['packages/ui/atoms/button.tsx', ['b--a', 'b--z']]]
    );
    assert.deepEqual(unmapped, ['packages/ui/brand/JovieO.stories.tsx']);
  });
  it('builds the preview iframe URL', () => {
    assert.equal(
      storyUrl('http://localhost:6006/', 'ui-atoms-card--default'),
      'http://localhost:6006/iframe.html?id=ui-atoms-card--default&viewMode=story'
    );
  });
});

describe('shards', () => {
  it('parses i/n and rejects nonsense', () => {
    assert.deepEqual(parseShard(undefined), { index: 1, total: 1 });
    assert.deepEqual(parseShard('2/3'), { index: 2, total: 3 });
    for (const bad of ['0/2', '3/2', '1', 'a/b', '1/0'])
      assert.throws(() => parseShard(bad));
  });
  it('splits whole components disjointly and covers all of them', () => {
    const all = new Map(
      ['a', 'b', 'c', 'd', 'e'].map((name, i) => [
        `packages/ui/atoms/${name}.tsx`,
        Array.from({ length: i + 1 }, (_, n) => `${name}--${n}`),
      ])
    );
    const shards = [1, 2, 3].map(index =>
      shardComponents(all, { index, total: 3 })
    );
    const owned = shards.flatMap(s => [...s.keys()]);
    assert.deepEqual([...owned].sort(), [...all.keys()].sort());
    assert.equal(new Set(owned).size, owned.length);
    for (const shard of shards)
      for (const [path, ids] of shard) assert.deepEqual(ids, all.get(path));
    assert.deepEqual(shardComponents(all, { index: 1, total: 1 }), all);
  });
});

describe('capture rules', () => {
  it('a clean, themed, screenshotted render passes both kinds', () => {
    assert.deepEqual(captureProblems(clean('s', 'dark'), 'dark', 'visual'), []);
    assert.deepEqual(captureProblems(clean('s', 'dark'), 'dark', 'a11y'), []);
  });
  it('fails on no render, errors, the wrong theme, no screenshot, axe', () => {
    assert.deepEqual(captureProblems(undefined, 'dark', 'visual'), [
      'not captured in dark',
    ]);
    assert.ok(
      captureProblems(clean('s', 'light', { rendered: false }), 'light', 'a11y')
        .length
    );
    assert.match(
      captureProblems(
        clean('s', 'light', { errors: ['pageerror boom'] }),
        'light',
        'visual'
      ).join(),
      /boom/
    );
    assert.match(
      captureProblems(
        clean('s', 'dark', { appliedTheme: 'light' }),
        'dark',
        'visual'
      ).join(),
      /rendered light, not dark/
    );
    assert.match(
      captureProblems(
        clean('s', 'dark', { screenshotSha256: null }),
        'dark',
        'visual'
      ).join(),
      /no screenshot/
    );
    const axe = clean('s', 'dark', {
      violations: [{ id: 'color-contrast' }, { id: 'button-name' }],
    });
    assert.deepEqual(captureProblems(axe, 'dark', 'visual'), []);
    assert.deepEqual(captureProblems(axe, 'dark', 'a11y'), [
      'axe button-name, color-contrast',
    ]);
  });
});

describe('receipt assembly', () => {
  const path = 'packages/ui/atoms/button.tsx';
  it('passes a component only when every story passed in light and dark', () => {
    const { visual, a11y } = assembleEvidence(one(path, ['b--a', 'b--b']), [
      ...both('b--a'),
      ...both('b--b'),
    ]);
    for (const file of [visual, a11y]) {
      const receipt = file.components[path];
      assert.equal(receipt.schema, STORY_EVIDENCE_SCHEMA);
      assert.equal(receipt.sourceHash, hashA);
      assert.equal(receipt.renderInputs.digest, hashA);
      assert.equal(receipt.status, 'pass');
      assert.equal(receipt.captured, 2);
      assert.equal(receipt.detail, undefined);
      assert.deepEqual(
        receipt.stories.map(s => [s.id, s.themes]),
        [
          ['b--a', ['light', 'dark']],
          ['b--b', ['light', 'dark']],
        ]
      );
      // The certificate accepts it as full light+dark proof.
      assert.deepEqual(acceptStoryReceipts(file.components).rejected, []);
    }
    assert.deepEqual(visual.components[path].stories[0].screenshots, {
      light: shot,
      dark: shot,
    });
  });
  it('one missing theme fails the whole component and names it', () => {
    const { visual } = assembleEvidence(one(path, ['b--a', 'b--b']), [
      ...both('b--a'),
      clean('b--b', 'light'),
    ]);
    assert.equal(visual.components[path].status, 'fail');
    assert.match(visual.components[path].detail, /b--b \[dark\]: not captured/);
    assert.deepEqual(visual.components[path].stories[1].themes, ['light']);
  });
  it('a throwing story fails visual and a11y; an axe violation fails a11y only', () => {
    const thrown = assembleEvidence(
      one(path, ['b--a']),
      both('b--a', {
        dark: { rendered: false, errors: ['storyThrewException: boom'] },
      })
    );
    assert.equal(thrown.visual.components[path].status, 'fail');
    assert.equal(thrown.a11y.components[path].status, 'fail');
    assert.match(thrown.visual.components[path].detail, /\[dark\].*boom/);

    const axe = assembleEvidence(
      one(path, ['b--a']),
      both('b--a', { light: { violations: [{ id: 'color-contrast' }] } })
    );
    assert.equal(axe.visual.components[path].status, 'pass');
    assert.equal(axe.a11y.components[path].status, 'fail');
    assert.equal(
      axe.a11y.components[path].detail,
      'b--a [light]: axe color-contrast'
    );
    // Failing receipts always stand in the certificate.
    assert.equal(
      acceptStoryReceipts(axe.a11y.components).components[path].status,
      'fail'
    );
  });
  it('checks a pinned-theme story in its own theme only', () => {
    const pin = { pinnedTheme: 'dark' };
    const captures = [
      ...both('b--a'),
      clean('b--dark', 'light', { ...pin, appliedTheme: 'dark' }),
      clean('b--dark', 'dark', pin),
    ];
    const { visual, a11y } = assembleEvidence(
      one(path, ['b--a', 'b--dark']),
      captures
    );
    for (const file of [visual, a11y]) {
      assert.equal(file.components[path].status, 'pass');
      assert.deepEqual(
        file.components[path].stories.map(s => s.id),
        ['b--a']
      );
      assert.deepEqual(acceptStoryReceipts(file.components).rejected, []);
    }
    captures[3] = clean('b--dark', 'dark', {
      ...pin,
      violations: [{ id: 'color-contrast' }],
    });
    const axe = assembleEvidence(one(path, ['b--a', 'b--dark']), captures);
    assert.equal(
      axe.a11y.components[path].detail,
      'b--dark [dark]: axe color-contrast'
    );
  });
  it('caps the detail and fails a component with no stories', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const { a11y } = assembleEvidence(one(path, ids), []);
    assert.match(a11y.components[path].detail, /\+7 more$/);
    const empty = assembleEvidence(one(path, []), []);
    assert.equal(empty.visual.components[path].status, 'fail');
    assert.equal(empty.visual.components[path].detail, 'no stories captured');
  });
});

describe('shard merge', () => {
  it('joins shard files and lets a failure win a conflict', () => {
    const pass = { status: 'pass', sourceHash: hashA };
    const fail = { status: 'fail', sourceHash: hashA, detail: 'x' };
    assert.deepEqual(
      mergeEvidence([
        { components: { 'packages/ui/b.tsx': pass } },
        { components: { 'packages/ui/a.tsx': pass } },
        { components: { 'packages/ui/b.tsx': fail } },
        { components: { 'packages/ui/b.tsx': pass } },
      ]),
      { components: { 'packages/ui/a.tsx': pass, 'packages/ui/b.tsx': fail } }
    );
  });
});

it('rejects shards with conflicting render provenance for the same component', () => {
  const path = 'packages/ui/atoms/button.tsx';
  const receipt = {
    status: 'pass',
    renderInputs: {
      schema: 'jovie.component-render-inputs/v1',
      mode: 'storybook-full',
      digest: hashA,
    },
  };
  assert.throws(
    () =>
      mergeEvidence([
        { components: { [path]: receipt } },
        {
          components: {
            [path]: {
              ...receipt,
              renderInputs: { ...receipt.renderInputs, digest: 'b'.repeat(64) },
            },
          },
        },
      ]),
    /conflicting render inputs/
  );
});
