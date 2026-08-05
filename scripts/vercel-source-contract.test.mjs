import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
});
