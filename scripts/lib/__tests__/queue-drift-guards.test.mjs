import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { REGISTRY_PATH, tightenCommands } from '../../baselines-tighten.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const listedBaselines = () => [
  ...registry.guards.map(guard => guard.baseline),
  ...registry.combineSafe.baselines,
  ...registry.exactMatch.flatMap(group => group.baselines),
  ...registry.unreviewed.baselines,
];

/** Tracked baseline files; a `*.baseline/` directory counts once. */
export function trackedBaselines(files) {
  return [
    ...new Set(
      files
        .filter(file => /baseline[^/]*\.json$|\.baseline\//i.test(file))
        // Vendored skill fixtures and dated evidence snapshots are not gates.
        .filter(
          file =>
            !file.startsWith('.agents/') &&
            !file.startsWith('docs/operations/evidence/')
        )
        .map(file => file.replace(/(\.baseline)\/.*$/i, '$1/'))
    ),
  ].sort();
}

test('every tracked baseline is classified for combine safety', () => {
  const tracked = trackedBaselines(
    execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    })
      .split('\0')
      .filter(Boolean)
  );
  assert.ok(tracked.length > 50, 'the scan found the baselines');
  const listed = new Set(listedBaselines());
  assert.deepEqual(
    tracked.filter(file => !listed.has(file)),
    [],
    'New baseline: add it to scripts/lib/queue-drift-guards.json with its semantic. ' +
      'Use scripts/lib/shrink-only-baseline.mjs (growth fails, a shrink passes) or one entry per file; ' +
      'an exact-match baseline fails when two green PRs combine.'
  );
});

test('the scan sees new baseline files and directories', () => {
  assert.deepEqual(
    trackedBaselines([
      'apps/web/new-thing.baseline.json',
      'apps/web/tests/x.baseline/a__b.tsx.json',
      'apps/web/tests/x.baseline/c.tsx.json',
      'scripts/typecheck-baseline.json',
      'apps/web/page.tsx',
      '.agents/skills/gstack/test/fixtures/eval-baselines.json',
    ]),
    [
      'apps/web/new-thing.baseline.json',
      'apps/web/tests/x.baseline/',
      'scripts/typecheck-baseline.json',
    ]
  );
});

test('registry entries are real, unique and say why they are left', () => {
  assert.equal(registry.schema, 'jovie.queue-drift-guards/v1');
  const ids = registry.guards.map(guard => guard.id);
  assert.equal(new Set(ids).size, ids.length, 'guard ids are unique');
  const paths = listedBaselines();
  assert.equal(new Set(paths).size, paths.length, 'each baseline listed once');
  for (const path of paths) {
    assert.ok(existsSync(`${root}${path}`), `${path} does not exist`);
  }
  for (const group of registry.exactMatch) {
    assert.match(
      group.reason,
      /^Not migrated: .{20,}/,
      'an exact-match baseline must say why it was left'
    );
    assert.ok(group.baselines.length > 0);
  }
  assert.ok(registry.combineSafe.reason.trim().length > 20);
  assert.ok(registry.unreviewed.reason.trim().length > 20);
});

test('only shrink-only guards are tightened, by a command that cannot raise a baseline', () => {
  const commands = tightenCommands(registry);
  assert.deepEqual(
    commands.map(item => item.id),
    [
      'design-noise',
      'marketing-route-source-invariants',
      'offer-claims',
      'stat-claims',
      'size-500',
    ]
  );
  for (const { id, tighten } of commands) {
    const guard = registry.guards.find(item => item.id === id);
    assert.ok(guard.check, `${id}: needs a check command`);
    // The blanket rewrites adopt growth; they must never be the tighten path.
    assert.doesNotMatch(
      tighten,
      /--update|--write-baseline|UPDATE_[A-Z_]*BASELINE/,
      `${id}: tighten must not be a baseline rewrite`
    );
    assert.match(tighten, /--tighten|TIGHTEN_BASELINES=1/);
  }
});
