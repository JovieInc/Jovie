import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  evaluateBaseDesignRatchet,
  offScaleSteps,
} from './design-system-base-ratchet.mjs';
import {
  ON_SCALE_STEPS,
  RAW_HEX_PATTERN,
  RAW_PALETTE_PATTERN,
} from './design-system-source-ratchet.mjs';

const all = (source, pattern) =>
  source.match(new RegExp(pattern.source, pattern.flags)) ?? [];

test('raw hex rule catches 6/8 digit literals, not token refs or short ids', () => {
  assert.deepEqual(all('color: "#FFFFFF", b: "#00000000"', RAW_HEX_PATTERN), [
    '#FFFFFF',
    '#00000000',
  ]);
  assert.deepEqual(all('href="#section" var(--color-bg)', RAW_HEX_PATTERN), []);
});

test('raw palette rule catches palette families, leaves semantic tokens and white/black to eslint', () => {
  assert.deepEqual(
    all(
      'bg-amber-500 text-emerald-300 border-rose-500/40',
      RAW_PALETTE_PATTERN
    ),
    ['bg-amber-500', 'text-emerald-300', 'border-rose-500']
  );
  assert.deepEqual(
    all(
      'text-primary-token bg-surface-1 text-white bg-black',
      RAW_PALETTE_PATTERN
    ),
    []
  );
});

test('off-scale step rule flags numbers with no name on the scale, on any sized utility', () => {
  assert.deepEqual(
    offScaleSteps(
      'h-7.25 md:min-h-55 -mt-13 leading-4.5 w-107.5 size-4.5 !top-15'
    ),
    [
      'h-7.25',
      'min-h-55',
      'mt-13',
      'leading-4.5',
      'w-107.5',
      'size-4.5',
      'top-15',
    ]
  );
  assert.deepEqual(
    offScaleSteps(
      'h-7 w-1/2 max-w-7xl h-[29px] p-(--x) top-1.5 size-3.5 gap-2.5 w-px col-span-13 z-50 h-11'
    ),
    []
  );
  assert.deepEqual(offScaleSteps(' * enforced by the size-500 guard'), []);
  assert.deepEqual(offScaleSteps('  // was h-7.25'), []);
  assert.equal(ON_SCALE_STEPS.has('4.5'), false);
});

const commit = (git, message) => {
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '-m',
    message
  );
};
const steps = result =>
  result.newIdentities.filter(key => key.includes('\toff-scale-step\t'));

test('off-scale steps: grandfathered base debt passes, only steps the diff adds fail', t => {
  const { repoRoot, write } = fixture(t);
  const row = 'apps/web/components/a/Row.tsx';
  // Base already carries h-160 and h-7.25 in this file: both stay green, also
  // when the class string around them is rewritten.
  assert.deepEqual(steps(evaluateBaseDesignRatchet({ repoRoot })), []);
  write(row, 'export const row = "flex h-7.25 items-center h-160 px-3";');
  assert.deepEqual(steps(evaluateBaseDesignRatchet({ repoRoot })), []);
  // Deliberate red: a new value in that file, the grandfathered value in a
  // second file, and a new step in packages/ui each fail.
  write(row, 'export const row = "h-7.25 h-160 h-161";');
  write('apps/web/app/other.tsx', 'export const other = "h-7.25";');
  write('packages/ui/Badge.tsx', 'export const Badge = "py-1.25";');
  assert.deepEqual(steps(evaluateBaseDesignRatchet({ repoRoot })), [
    `apps/web/app/other.tsx\toff-scale-step\th-7.25`,
    `${row}\toff-scale-step\th-161`,
    'packages/ui/Badge.tsx\toff-scale-step\tpy-1.25',
  ]);
});

test('off-scale steps: comments, tests and stories are not product source; removal passes', t => {
  const { repoRoot, write } = fixture(t);
  write(
    'apps/web/app/other.tsx',
    '/**\n * see the size-500 guard\n */\n// h-7.25\nexport const other = "h-7";'
  );
  write('apps/web/app/other.test.tsx', 'export const x = "h-7.25";');
  write('apps/web/app/other.stories.tsx', 'export const x = "h-7.25";');
  write('apps/web/components/a/Row.tsx', 'export const row = "h-7 h-40";');
  assert.equal(evaluateBaseDesignRatchet({ repoRoot }).ok, true);
});

test('off-scale steps: main changing class strings never fails a branch that did not add the step', t => {
  const { repoRoot, git, write } = fixture(t);
  const row = 'apps/web/components/a/Row.tsx';
  git('branch', 'feature');
  // Another PR lands on main: removes h-160 here, adds w-90 elsewhere.
  write(row, 'export const row = "h-7.25 h-40";');
  write('apps/web/app/landed.tsx', 'export const landed = "w-90";');
  commit(git, 'landed alignment pass');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const tip = git('rev-parse', 'HEAD');
  // The stale branch still has h-160 from its fork point and edits another
  // file: nothing in its diff is new.
  git('checkout', '--quiet', 'feature');
  write('apps/web/app/mine.tsx', 'export const mine = "h-7";');
  commit(git, 'unrelated work');
  assert.deepEqual(steps(evaluateBaseDesignRatchet({ repoRoot })), []);
  // Its own addition still fails, including a value main only has elsewhere.
  write('apps/web/app/mine.tsx', 'export const mine = "w-90";');
  assert.deepEqual(steps(evaluateBaseDesignRatchet({ repoRoot })), [
    'apps/web/app/mine.tsx\toff-scale-step\tw-90',
  ]);
  // Once the branch sits on the target tip (rebase, merge queue), the landed
  // removal cannot regrow.
  git('checkout', '--quiet', '--force', tip);
  write(row, 'export const row = "h-7.25 h-160";');
  assert.deepEqual(steps(evaluateBaseDesignRatchet({ repoRoot })), [
    `${row}\toff-scale-step\th-160`,
  ]);
});

function fixture(t) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'design-base-ratchet-'));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  const write = (path, source) => {
    mkdirSync(dirname(join(repoRoot, path)), { recursive: true });
    writeFileSync(join(repoRoot, path), source);
  };
  git('init', '--quiet');
  write('apps/web/app/page.tsx', 'const color = "#112233 bg-amber-500";');
  write('apps/web/components/a/Badge.tsx', 'export const Badge = 1;');
  write('packages/ui/Badge.tsx', 'export const Badge = 2;');
  write('apps/web/components/a/Row.tsx', 'export const row = "h-7.25 h-160";');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '-m',
    'base'
  );
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return { repoRoot, git, write };
}

test('uses base source debt without expanding committed allowances; shrink passes', t => {
  const { repoRoot, write } = fixture(t);
  assert.equal(evaluateBaseDesignRatchet({ repoRoot }).ok, true);
  write('apps/web/app/page.tsx', 'const color = "var(--color-bg)";');
  assert.equal(evaluateBaseDesignRatchet({ repoRoot }).ok, true);
});

test('rejects new raw identities and an extra fork of an already duplicated component', t => {
  const { repoRoot, write } = fixture(t);
  write('apps/web/app/page.tsx', 'const color = "#445566 text-rose-500";');
  write('apps/web/components/b/Badge.tsx', 'export const Badge = 3;');
  const result = evaluateBaseDesignRatchet({ repoRoot });
  assert.equal(result.ok, false);
  assert.deepEqual(result.newIdentities, [
    'apps/web/app/page.tsx\traw-hex-color\t#445566',
    'apps/web/app/page.tsx\traw-palette-class\ttext-rose-500',
    'apps/web/components/b/Badge.tsx\tduplicate-component\tBadge',
  ]);
});

test('locks in landed removals and does not grandfather feature-branch debt', t => {
  const { repoRoot, git, write } = fixture(t);
  write('apps/web/app/page.tsx', 'const color = "var(--color-bg)";');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '-m',
    'shrink'
  );
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  write('apps/web/app/page.tsx', 'const color = "#112233";');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '-m',
    'regrow'
  );
  assert.equal(evaluateBaseDesignRatchet({ repoRoot }).ok, false);
});

test('fails closed if the trusted base is missing', t => {
  const { repoRoot } = fixture(t);
  assert.throws(
    () => evaluateBaseDesignRatchet({ repoRoot, baseRef: 'missing' }),
    /trusted design base/
  );
});

test('uses the target tip to reject regrowth on a stale feature branch', t => {
  const { repoRoot, git, write } = fixture(t);
  git('branch', 'feature');
  write('apps/web/app/page.tsx', 'const color = "var(--color-bg)";');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '-m',
    'landed shrink'
  );
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '--quiet', 'feature');
  assert.equal(evaluateBaseDesignRatchet({ repoRoot }).ok, false);
});
