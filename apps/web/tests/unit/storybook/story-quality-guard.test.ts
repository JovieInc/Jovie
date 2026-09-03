import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

function runGuard(fixtureRoot: string) {
  return spawnSync(process.execPath, [guardPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, STORYBOOK_QUALITY_ROOT: fixtureRoot },
  });
}

describe('storybook story quality guard', () => {
  it('passes on the current product story library and provenance receipts', () => {
    const output = execFileSync(process.execPath, [guardPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(output).toContain('[story-quality] clean');
  });

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
});
