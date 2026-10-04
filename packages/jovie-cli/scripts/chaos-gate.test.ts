import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain ESM script without declarations
import { applyMutant, MUTANTS } from './chaos-mutation-proof.mjs';

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')
) as { scripts: Record<string, string> };

describe('chaos gate wiring (JOV-7714)', () => {
  it('runs the black-box gate and the deliberate-red proof on every PR build', () => {
    expect(manifest.scripts['chaos:gate']).toBe(
      'node scripts/chaos-blackbox.mjs --bin dist/cli.js --profile pr && node scripts/chaos-mutation-proof.mjs --dist dist'
    );
  });

  it('proves a stack trace, a hang, and a secret leak are each blocked', () => {
    const scenarios = MUTANTS.map(
      (mutant: { scenario: string }) => mutant.scenario
    );
    expect(scenarios).toEqual(
      expect.arrayContaining([
        'closed-stdout-pipe',
        'artist-not-found',
        'hang-before-headers',
        'injected-escapes-and-secrets',
      ])
    );
  });

  it('fails as stale instead of passing when an anchor drifts', () => {
    const mutant = { name: 'x', file: 'cli.js', from: 'needle', to: 'pin' };
    expect(applyMutant('hay needle hay', mutant)).toBe('hay pin hay');
    expect(() => applyMutant('hay', mutant)).toThrow('Stale proof');
    expect(() => applyMutant('needle needle', mutant)).toThrow('Stale proof');
  });
});
