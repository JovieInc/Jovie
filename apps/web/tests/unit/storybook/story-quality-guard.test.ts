import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// tests/unit/storybook -> apps/web -> repo root (5 levels up from this file's dir)
const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../'
);
const guardPath = join(repoRoot, 'scripts/storybook-story-quality-guard.mjs');

function fixtureGit(fixtureRoot: string, args: string[]) {
  return execFileSync('git', ['-C', fixtureRoot, ...args], {
    encoding: 'utf8',
  }).trim();
}

function runGuard(fixtureRoot: string, env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [guardPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, STORYBOOK_QUALITY_ROOT: fixtureRoot, ...env },
  });
}

const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();

describe('storybook story quality guard', () => {
  // The guard scans the full story library plus git provenance in one shot;
  // under merge-queue machine load this exceeds the 12s default test budget
  // (observed timing out a merge-group shard twice on 2026-09-03).
  //
  // In a shallow checkout the guard must first repair history: its
  // `fetch --unshallow` needs minutes on this repo and, without a token,
  // runs unauthenticated. That lane (the nightly deterministic job checks
  // out at depth 1 with persist-credentials: false) cannot converge inside
  // any sane test budget BY DESIGN — the failure carries zero signal, so
  // skip it with a named condition. Every history-bearing surface (full
  // nightly suite, PR lanes, local) still runs the real guard.
  const shallowWithoutToken =
    spawnSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).stdout.trim() === 'true' &&
    !process.env.GH_TOKEN &&
    !process.env.GITHUB_TOKEN;

  it.skipIf(shallowWithoutToken)(
    'passes on the current product story library and provenance receipts',
    {
      timeout: 60_000,
    },
    () => {
      const output = execFileSync(process.execPath, [guardPath], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      expect(output).toContain('[story-quality] clean');
    }
  );

  it('rejects a non-ancestor receipt in an isolated git fixture', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'jovie-story-provenance-'));
    const storyRelative = 'apps/web/components/Fixture.stories.tsx';
    const storyPath = join(fixtureRoot, storyRelative);
    const storyWithSha = (sha: string) => `export default {};
export const Fixture = { parameters: { pen: { sourceSha: '${sha}' } } };
`;

    try {
      mkdirSync(dirname(storyPath), { recursive: true });
      fixtureGit(fixtureRoot, ['init', '-b', 'main']);
      fixtureGit(fixtureRoot, ['config', 'user.email', 'fixture@example.com']);
      fixtureGit(fixtureRoot, ['config', 'user.name', 'Story Fixture']);
      writeFileSync(
        storyPath,
        `export default {};
export const Fixture = {};
`
      );
      fixtureGit(fixtureRoot, ['add', storyRelative]);
      fixtureGit(fixtureRoot, ['commit', '-m', 'seed story']);
      const ancestorSha = fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']);

      writeFileSync(storyPath, storyWithSha(ancestorSha));
      fixtureGit(fixtureRoot, ['add', storyRelative]);
      fixtureGit(fixtureRoot, ['commit', '-m', 'record ancestor receipt']);
      const valid = runGuard(fixtureRoot);
      expect(valid.status).toBe(0);
      expect(valid.stdout).toContain(
        '[story-quality] clean (1 stories scanned)'
      );

      fixtureGit(fixtureRoot, ['branch', 'stale']);
      fixtureGit(fixtureRoot, ['checkout', '--quiet', 'stale']);
      writeFileSync(
        storyPath,
        `${storyWithSha(ancestorSha)}// divergent branch\n`
      );
      fixtureGit(fixtureRoot, ['add', storyRelative]);
      fixtureGit(fixtureRoot, ['commit', '-m', 'create stale receipt target']);
      const staleSha = fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']);

      fixtureGit(fixtureRoot, ['checkout', '--quiet', 'main']);
      writeFileSync(storyPath, storyWithSha(staleSha));
      fixtureGit(fixtureRoot, ['add', storyRelative]);
      fixtureGit(fixtureRoot, ['commit', '-m', 'record stale receipt']);
      const invalid = runGuard(fixtureRoot);
      const invalidOutput = `${invalid.stdout}${invalid.stderr}`;
      expect(invalid.status).toBe(1);
      expect(invalidOutput).toContain('story-provenance-ancestor');
      expect(invalidOutput).toContain(staleSha);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
  it('reports a receipt below a shallow boundary as shallow, not a non-ancestor', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'jovie-story-shallow-'));
    const storyRelative = 'apps/web/components/Fixture.stories.tsx';
    const storyPath = join(fixtureRoot, storyRelative);
    const commit = (content: string, message: string) => {
      writeFileSync(storyPath, content);
      fixtureGit(fixtureRoot, ['add', storyRelative]);
      fixtureGit(fixtureRoot, ['commit', '-m', message]);
      return fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']);
    };

    try {
      mkdirSync(dirname(storyPath), { recursive: true });
      fixtureGit(fixtureRoot, ['init', '-b', 'main']);
      fixtureGit(fixtureRoot, ['config', 'user.email', 'fixture@example.com']);
      fixtureGit(fixtureRoot, ['config', 'user.name', 'Story Fixture']);
      const receiptSha = commit('export default {};\n', 'seed story');
      const boundarySha = commit('export default {};\n// v2\n', 'middle');
      commit(
        `export default {};
export const Fixture = { parameters: { pen: { sourceSha: '${receiptSha}' } } };
`,
        'record receipt'
      );
      expect(runGuard(fixtureRoot).status).toBe(0);

      // The receipt object stays present, but the boundary hides it from HEAD:
      // the state a checkout is in when its history was cut after unshallowing.
      writeFileSync(join(fixtureRoot, '.git/shallow'), `${boundarySha}\n`);
      const result = runGuard(fixtureRoot);
      const output = `${result.stdout}${result.stderr}`;
      expect(result.status).toBe(1);
      expect(output).toContain('story-provenance-shallow');
      expect(output).toContain('2 commits reachable, 1 shallow boundaries');
      expect(output).toContain(`boundary ${boundarySha}`);
      expect(output).toContain('last fetch: none');
      expect(output).not.toContain('story-provenance-ancestor');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('repairs a mid-run shallow boundary before reporting a receipt', () => {
    // JOV-6623: a concurrent depth-limited fetch can re-shallow the checkout
    // after the job's base-fetch step verified it was complete. The guard must
    // unshallow and re-run the verdict instead of failing a good receipt.
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'jovie-story-heal-'));
    const shimDir = mkdtempSync(join(tmpdir(), 'jovie-git-shim-'));
    const storyRelative = 'apps/web/components/Fixture.stories.tsx';
    const storyPath = join(fixtureRoot, storyRelative);

    try {
      mkdirSync(dirname(storyPath), { recursive: true });
      fixtureGit(fixtureRoot, ['init', '-b', 'main']);
      fixtureGit(fixtureRoot, ['config', 'user.email', 'fixture@example.com']);
      fixtureGit(fixtureRoot, ['config', 'user.name', 'Story Fixture']);
      writeFileSync(storyPath, 'export default {};\n');
      fixtureGit(fixtureRoot, ['add', storyRelative]);
      fixtureGit(fixtureRoot, ['commit', '-m', 'seed story']);
      const receiptSha = fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']);
      writeFileSync(storyPath, 'export default {};\n// v2\n');
      fixtureGit(fixtureRoot, ['add', storyRelative]);
      fixtureGit(fixtureRoot, ['commit', '-m', 'middle']);
      const boundarySha = fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']);
      writeFileSync(
        storyPath,
        `export default {};
export const Fixture = { parameters: { pen: { sourceSha: '${receiptSha}' } } };
`
      );
      fixtureGit(fixtureRoot, ['add', storyRelative]);
      fixtureGit(fixtureRoot, ['commit', '-m', 'record receipt']);

      // The receipt object stays in the object store; the boundary only hides
      // it from HEAD. The shim's `fetch` is the unshallow repair: it drops the
      // boundary and exits 0. Everything else delegates to the real git.
      writeFileSync(join(fixtureRoot, '.git/shallow'), `${boundarySha}\n`);
      const realGit = execFileSync('which', ['git'], {
        encoding: 'utf8',
      }).trim();
      writeFileSync(
        join(shimDir, 'git'),
        `#!/bin/sh
while [ "$1" = "-c" ]; do shift 2; done
if [ "$1" = "fetch" ]; then rm -f "$PWD/.git/shallow"; exit 0; fi
exec ${JSON.stringify(realGit)} "$@"
`
      );
      execFileSync('chmod', ['+x', join(shimDir, 'git')]);

      const result = spawnSync(process.execPath, [guardPath], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${shimDir}:${process.env.PATH}`,
          GIT_CEILING_DIRECTORIES: dirname(fixtureRoot),
          STORYBOOK_QUALITY_ROOT: fixtureRoot,
        },
      });
      const output = `${result.stdout}${result.stderr}`;
      expect(result.status).toBe(0);
      expect(output).toContain('[story-quality] clean');
      expect(output).not.toContain('story-provenance-ancestor');
      expect(output).not.toContain('story-provenance-shallow');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
      rmSync(shimDir, { recursive: true, force: true });
    }
  });

  it('passes when a racing commit-graph write flips the ancestry verdict', () => {
    // Reproduces JOV-6626: a detached `git maintenance` process rewrites
    // .git/objects/info/commit-graph while the structural lane's git reads
    // run, and a mid-write or stale graph answers `merge-base --is-ancestor`
    // falsely. The shim below returns that observed false verdict (exit 1)
    // for any merge-base read that still consults the commit-graph; reads
    // with `-c core.commitGraph=false` delegate to real git.
    const fixtureRoot = mkdtempSync(
      join(tmpdir(), 'jovie-story-commit-graph-')
    );
    const storyRelative = 'apps/web/components/Fixture.stories.tsx';
    const storyPath = join(fixtureRoot, storyRelative);
    const shimDir = join(fixtureRoot, 'bin');
    const shimPath = join(shimDir, 'git');

    try {
      mkdirSync(dirname(storyPath), { recursive: true });
      mkdirSync(shimDir);
      writeFileSync(
        shimPath,
        `#!/bin/sh
case " $* " in
  *" merge-base "*)
    case " $* " in
      *" core.commitGraph=false "*) ;;
      *) exit 1 ;;
    esac
    ;;
esac
exec "${realGit}" "$@"
`
      );
      chmodSync(shimPath, 0o755);

      fixtureGit(fixtureRoot, ['init', '-b', 'main']);
      fixtureGit(fixtureRoot, ['config', 'user.email', 'fixture@example.com']);
      fixtureGit(fixtureRoot, ['config', 'user.name', 'Story Fixture']);
      writeFileSync(storyPath, 'export default {};\n');
      fixtureGit(fixtureRoot, ['add', storyRelative]);
      fixtureGit(fixtureRoot, ['commit', '-m', 'seed story']);
      const receiptSha = fixtureGit(fixtureRoot, ['rev-parse', 'HEAD']);
      writeFileSync(
        storyPath,
        `export default {};
export const Fixture = { parameters: { pen: { sourceSha: '${receiptSha}' } } };
`
      );
      fixtureGit(fixtureRoot, ['add', storyRelative]);
      fixtureGit(fixtureRoot, ['commit', '-m', 'record receipt']);

      const result = runGuard(fixtureRoot, {
        PATH: `${shimDir}:${process.env.PATH}`,
      });
      const output = `${result.stdout}${result.stderr}`;
      expect(result.status).toBe(0);
      expect(output).toContain('[story-quality] clean (1 stories scanned)');
      expect(output).not.toContain('story-provenance-ancestor');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails closed with the git error instead of a false provenance verdict', () => {
    // Not a git repository: every provenance git call exits 128. That is an
    // execution error, never "missing commit" or "not an ancestor".
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'jovie-story-git-error-'));
    const storyPath = join(
      fixtureRoot,
      'apps/web/components/Fixture.stories.tsx'
    );
    const sha = 'a'.repeat(40);

    try {
      mkdirSync(dirname(storyPath), { recursive: true });
      writeFileSync(
        storyPath,
        `export default {};
export const Fixture = { parameters: { pen: { sourceSha: '${sha}' } } };
`
      );
      const result = spawnSync(process.execPath, [guardPath], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_CEILING_DIRECTORIES: dirname(fixtureRoot),
          STORYBOOK_QUALITY_ROOT: fixtureRoot,
        },
      });
      const output = `${result.stdout}${result.stderr}`;
      expect(result.status).toBe(1);
      expect(output).toContain('story-provenance-git-error');
      expect(output).toContain(
        `git rev-parse --verify --quiet ${sha}^{commit}`
      );
      expect(output).not.toContain('story-provenance-commit');
      expect(output).not.toContain('story-provenance-ancestor');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
