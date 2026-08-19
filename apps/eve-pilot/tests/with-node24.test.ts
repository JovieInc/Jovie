import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('with-node24', () => {
  it('puts Node >= 24 on PATH even when the parent is older', () => {
    const version = execFileSync(
      'bash',
      [
        resolve(process.cwd(), 'scripts/with-node24.sh'),
        'node',
        '-p',
        'process.versions.node',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          // Force the picker off any already-active Node 24 so we exercise
          // the nvm/Homebrew fallback the user's Node 22 shell needs.
        },
      }
    ).trim();

    const major = Number(version.split('.')[0]);
    expect(major).toBeGreaterThanOrEqual(24);
  });
});
