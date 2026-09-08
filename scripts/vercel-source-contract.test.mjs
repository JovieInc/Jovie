import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('Vercel source contract', () => {
  it('keeps the docs build config and root route in the source upload', () => {
    const ignored = execFileSync(
      'git',
      [
        'ls-files',
        '-ci',
        '--exclude-from=.vercelignore',
        'apps/docs/package.json',
        'apps/docs/next.config.mjs',
        'apps/docs/app/page.mdx',
      ],
      { encoding: 'utf8' }
    );

    assert.equal(ignored.trim(), '');
  });

  it('pins production install to PATH pnpm so Promote cannot re-enter crashing corepack', () => {
    const root = JSON.parse(readFileSync('vercel.json', 'utf8'));
    const web = JSON.parse(readFileSync('apps/web/vercel.json', 'utf8'));

    assert.equal(root.installCommand, 'pnpm install --frozen-lockfile');
    assert.equal(
      root.buildCommand,
      'env -u TURBO_REMOTE_ONLY pnpm turbo build --filter=@jovie/web'
    );
    assert.doesNotMatch(root.installCommand, /corepack/);
    assert.doesNotMatch(root.buildCommand, /corepack/);
    assert.equal(web.installCommand, 'pnpm install --frozen-lockfile');
    assert.equal(web.buildCommand, 'pnpm run build');
    assert.doesNotMatch(web.installCommand, /corepack/);
    assert.doesNotMatch(web.buildCommand, /corepack/);
  });

  it('builds the docs package instead of inheriting the web project config', () => {
    const config = JSON.parse(readFileSync('apps/docs/vercel.json', 'utf8'));

    assert.equal(config.framework, 'nextjs');
    assert.equal(config.buildCommand, 'corepack pnpm run build');
    assert.equal(config.outputDirectory, '.next');
    // The current native Vercel policy builds release branches and skips PRs.
    for (const [branch, status] of [
      ['main', 1],
      ['production', 1],
      ['codex/test', 0],
    ]) {
      const result = spawnSync('bash', ['-c', config.ignoreCommand], {
        env: { ...process.env, VERCEL_GIT_COMMIT_REF: branch },
        encoding: 'utf8',
      });
      assert.equal(result.status, status, result.stderr);
    }
    assert.doesNotMatch(config.buildCommand, /@jovie\/web/);
  });
});
