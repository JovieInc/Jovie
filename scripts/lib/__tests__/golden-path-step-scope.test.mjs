import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gitTouched } from '../../golden-path-cert-reuse.mjs';
import { decideCarry } from '../golden-path-cert-reuse.mjs';
import {
  changedPathsBetween,
  loadStepScopeConfig,
  MAX_CHANGED_PATHS,
  STEP_SCOPE_FILE,
  STEP_SCOPE_SCHEMA,
  stepScope,
  touchedSteps,
  withTree,
} from '../golden-path-step-scope.mjs';
import { SURFACE_IDS } from '../prod-cert.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

/**
 * A tiny repo with two steps that own files: landing (the homepage screen and
 * its component) and chat (the chat API route and the lib it imports). The
 * other six steps own nothing, so only a global change touches them.
 */
const BASE = {
  [STEP_SCOPE_FILE]: JSON.stringify({
    schema: STEP_SCOPE_SCHEMA,
    steps: Object.fromEntries(
      SURFACE_IDS.map(id => [
        id,
        {
          screens: id === 'landing' ? ['home'] : [],
          pages: [],
          routes: id === 'chat' ? ['apps/web/app/api/chat/'] : [],
        },
      ])
    ),
    global: { entries: [], files: ['pnpm-lock.yaml'], prefixes: [] },
    producers: { entries: [] },
  }),
  'docs/design-system/cert-screens.json': JSON.stringify({
    screens: { home: { page: 'apps/web/app/page.tsx' } },
  }),
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'apps/web/app/layout.tsx':
    'export default function Root({ children }) { return children; }\n',
  'apps/web/app/page.tsx':
    "import { Hero } from '@/components/Hero';\nexport default function Page() { return Hero(); }\n",
  'apps/web/components/Hero.tsx': "export const Hero = () => 'hero';\n",
  'apps/web/app/api/chat/route.ts':
    "import { reply } from '@/lib/chat/reply';\nexport const POST = () => reply();\n",
  'apps/web/lib/chat/reply.ts':
    "import { tone } from './helper';\nexport const reply = () => tone;\n",
  'apps/web/lib/chat/helper.ts': "export const tone = 'warm';\n",
  'apps/web/lib/unused.ts': 'export const unused = 1;\n',
};

let repo;
const shas = {};

function git(...args) {
  const result = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function write(files) {
  for (const [path, text] of Object.entries(files)) {
    const file = join(repo, path);
    if (text === null) {
      rmSync(file);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** Commit `files` on top of the base commit; returns the new SHA. */
function branchFromBase(name, files) {
  git('checkout', '-q', '-B', name, shas.base);
  write(files);
  git('add', '-A');
  git('commit', '-q', '-m', name);
  return git('rev-parse', 'HEAD');
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'golden-path-scope-'));
  git('init', '-q', '-b', 'main');
  write(BASE);
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  shas.base = git('rev-parse', 'HEAD');
  shas.hero = branchFromBase('hero', {
    'apps/web/components/Hero.tsx': "export const Hero = () => 'new hero';\n",
  });
  shas.lockfile = branchFromBase('lockfile', {
    'pnpm-lock.yaml': 'lockfileVersion: 9\n# bumped\n',
  });
  shas.deleted = branchFromBase('deleted', {
    'apps/web/lib/chat/helper.ts': null,
    'apps/web/lib/chat/reply.ts': "export const reply = () => 'warm';\n",
  });
  shas.docs = branchFromBase('docs', {
    'docs/notes.md': '# notes\n',
    'apps/web/lib/unused.ts': 'export const unused = 2;\n',
  });
  shas.unknown = branchFromBase('unknown', { 'mystery.bin': 'x' });
  shas.unresolved = branchFromBase('unresolved', {
    'apps/web/app/page.tsx':
      "import { Gone } from '@/components/Gone';\nexport default function Page() { return Gone(); }\n",
  });
  // The working tree is the checkout that runs the producer: the base.
  git('checkout', '-q', 'main');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

/** The carry plan for `served`, with every step last passed on the base. */
function carryTo(served) {
  const pass = {
    sha: shas.base,
    endedAt: '2026-11-01T00:00:00.000Z',
    runUrl: null,
  };
  return decideCarry({
    servedSha: served,
    ledger: {
      servedSha: shas.base,
      surfaces: Object.fromEntries(
        SURFACE_IDS.map(id => [id, { lastPassed: { ...pass } }])
      ),
    },
    touched: gitTouched({ root: repo, servedSha: served, head: served }),
  });
}

describe('step scope closure (JOV-14402)', () => {
  it('follows a page through its layouts and imports', () => {
    const landing = stepScope(repo, 'landing');
    expect(landing.unresolved).toEqual([]);
    expect(landing.files).toEqual(
      expect.arrayContaining([
        'apps/web/app/page.tsx',
        'apps/web/app/layout.tsx',
        'apps/web/components/Hero.tsx',
      ])
    );
    expect(landing.files).not.toContain('apps/web/lib/chat/reply.ts');
  });

  it('follows the code under a step route into lib', () => {
    const chat = stepScope(repo, 'chat');
    expect(chat.prefixes).toEqual(['apps/web/app/api/chat/']);
    expect(chat.files).toEqual(
      expect.arrayContaining([
        'apps/web/app/api/chat/route.ts',
        'apps/web/lib/chat/reply.ts',
        'apps/web/lib/chat/helper.ts',
      ])
    );
    expect(chat.files).not.toContain('apps/web/components/Hero.tsx');
  });

  it('reports an import it cannot resolve', () => {
    withTree(repo, shas.unresolved, tree => {
      expect(stepScope(tree, 'landing').unresolved).toEqual([
        'apps/web/app/page.tsx -> @/components/Gone',
      ]);
    });
  });

  it('validates the real step scope config for every step', () => {
    const config = loadStepScopeConfig(REPO_ROOT);
    expect(Object.keys(config.steps).sort()).toEqual([...SURFACE_IDS].sort());
    expect(config.global.files).toContain('pnpm-lock.yaml');
  });
});

describe('touchedSteps fails closed', () => {
  const every = result => {
    expect(result.all).toBe(true);
    expect(result.steps).toEqual([...SURFACE_IDS]);
    return result.reason;
  };

  it('touches every step without a full path list', () => {
    expect(every(touchedSteps(null, repo))).toBe('no changed-path list');
    expect(every(touchedSteps([], repo, { truncated: true }))).toBe(
      'the diff was truncated'
    );
    const huge = Array.from(
      { length: MAX_CHANGED_PATHS + 1 },
      (_, i) => `docs/${i}.md`
    );
    expect(every(touchedSteps(huge, repo))).toContain('more than');
    expect(every(touchedSteps(['../escape'], repo))).toBe(
      'a changed path is malformed'
    );
  });

  it('touches every step for a path it cannot place', () => {
    expect(every(touchedSteps(['mystery.bin'], repo))).toBe(
      'mystery.bin is not placed in any step'
    );
  });

  it('touches every step for a global file or any package manifest', () => {
    expect(every(touchedSteps(['pnpm-lock.yaml'], repo))).toContain(
      'pnpm-lock.yaml'
    );
    expect(every(touchedSteps(['packages/copy/src/index.ts'], repo))).toContain(
      'every step'
    );
    expect(every(touchedSteps(['apps/web/package.json'], repo))).toContain(
      'every step'
    );
  });

  it('touches every step when a scope has an unresolved import', () => {
    withTree(repo, shas.unresolved, tree => {
      expect(every(touchedSteps(['docs/notes.md'], tree))).toContain(
        'landing scope is unresolved'
      );
    });
  });

  it('places docs, tests and unimported web modules outside every step', () => {
    const result = touchedSteps(
      [
        'docs/notes.md',
        'apps/web/lib/unused.ts',
        'apps/web/lib/chat/reply.test.ts',
        'scripts/other.mjs',
      ],
      repo
    );
    expect(result).toMatchObject({ all: false, steps: [] });
  });

  it('counts a delete against the tree that still had the file', () => {
    const path = 'apps/web/lib/chat/helper.ts';
    withTree(repo, shas.base, oldTree =>
      withTree(repo, shas.deleted, newTree => {
        // The new tree alone no longer imports the file: it would carry.
        expect(touchedSteps([path], [newTree]).steps).toEqual([]);
        // The union of both trees sees it in the chat scope.
        expect(touchedSteps([path], [oldTree, newTree])).toMatchObject({
          all: false,
          steps: ['chat'],
        });
      })
    );
  });
});

describe('carry versus re-certify through git', () => {
  const recertified = plan => plan.recertify.map(r => r.surface);
  const carried = plan => plan.carried.map(c => c.surface);

  it('lists both sides of a change, deletes included', () => {
    expect(changedPathsBetween(repo, shas.base, shas.deleted).sort()).toEqual([
      'apps/web/lib/chat/helper.ts',
      'apps/web/lib/chat/reply.ts',
    ]);
    expect(changedPathsBetween(repo, shas.base, shas.base)).toEqual([]);
  });

  it('re-certifies only the step a touched file belongs to', () => {
    const plan = carryTo(shas.hero);
    expect(recertified(plan)).toEqual(['landing']);
    expect(carried(plan)).toEqual(SURFACE_IDS.filter(id => id !== 'landing'));
    expect(plan.carried[0].from.sha).toBe(shas.base);
  });

  it('re-certifies every step for a lockfile change', () => {
    const plan = carryTo(shas.lockfile);
    expect(recertified(plan)).toEqual([...SURFACE_IDS]);
    expect(plan.recertify[0].why).toContain('pnpm-lock.yaml');
  });

  it('re-certifies the step a deleted file belonged to', () => {
    const plan = carryTo(shas.deleted);
    expect(recertified(plan)).toEqual(['chat']);
    expect(carried(plan)).toHaveLength(SURFACE_IDS.length - 1);
  });

  it('carries every step across a change that touches none of them', () => {
    const plan = carryTo(shas.docs);
    expect(recertified(plan)).toEqual([]);
    expect(carried(plan)).toEqual([...SURFACE_IDS]);
  });

  it('re-certifies every step for an unknown path or an unresolved import', () => {
    expect(recertified(carryTo(shas.unknown))).toEqual([...SURFACE_IDS]);
    expect(recertified(carryTo(shas.unresolved))).toEqual([...SURFACE_IDS]);
  });

  it('re-certifies every step when the certification code changed', () => {
    // Head is the checkout that runs the producer; a scope config change
    // since the step's release re-certifies everything.
    const changedConfig = branchFromBase('producer', {
      [STEP_SCOPE_FILE]: readFileSync(
        join(repo, STEP_SCOPE_FILE),
        'utf8'
      ).replace('"pnpm-lock.yaml"', '"pnpm-lock.yaml", "turbo.json"'),
    });
    git('checkout', '-q', 'main');
    const plan = decideCarry({
      servedSha: shas.hero,
      ledger: {
        servedSha: shas.base,
        surfaces: Object.fromEntries(
          SURFACE_IDS.map(id => [
            id,
            {
              lastPassed: {
                sha: shas.base,
                endedAt: '2026-11-01T00:00:00.000Z',
                runUrl: null,
              },
            },
          ])
        ),
      },
      touched: gitTouched({
        root: repo,
        servedSha: shas.hero,
        head: changedConfig,
      }),
    });
    expect(recertified(plan)).toEqual([...SURFACE_IDS]);
    expect(plan.recertify[0].why).toContain('certification code changed');
  });

  it('re-certifies every step when a commit is missing', () => {
    const plan = carryTo('f'.repeat(40));
    expect(recertified(plan)).toEqual([...SURFACE_IDS]);
  });
});
