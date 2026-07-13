import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');

describe('self-hosted runner setup action', () => {
  it('does not save pnpm caches from ephemeral runners', () => {
    const action = readFileSync(
      resolve(repoRoot, '.github/actions/setup-node-pnpm/action.yml'),
      'utf8',
    );

    expect(action).toContain("!startsWith(runner.name, 'jovie-eph-')");
    expect(action).toContain("!startsWith(runner.name, 'jovie-iso-')");
  });
});
