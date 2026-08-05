import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('Vercel source contract', () => {
  it('keeps the apps/docs package in the jovie-docs source upload', () => {
    const ignored = execFileSync(
      'git',
      [
        'ls-files',
        '-ci',
        '--exclude-from=.vercelignore',
        'apps/docs/package.json',
      ],
      { encoding: 'utf8' }
    );

    assert.equal(ignored.trim(), '');
  });

  it('builds the docs package instead of inheriting the web project config', () => {
    const config = JSON.parse(readFileSync('apps/docs/vercel.json', 'utf8'));

    assert.equal(config.framework, 'nextjs');
    assert.equal(config.buildCommand, 'corepack pnpm run build');
    assert.equal(config.outputDirectory, '.next');
    assert.match(config.ignoreCommand, /@jovie\/docs/);
    assert.doesNotMatch(config.buildCommand, /@jovie\/web/);
  });
});
