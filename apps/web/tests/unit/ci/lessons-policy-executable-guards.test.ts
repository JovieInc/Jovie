/**
 * Executable guards for LESSONS fingerprints that were previously policy-only:
 * - Local Doppler commands must pin `jovie-web/dev`
 * - New generated Drizzle migrations must be allowed to update `_journal.json`
 * - `pnpm vitest --run --changed` exits 0 with no test files
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../..'
);
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf8');

describe('LESSONS policy → executable guards', () => {
  it('pins local Doppler commands to jovie-web/dev in setup and environment rule', () => {
    const setup = read('scripts/setup.sh');
    expect(setup).toMatch(/DOPPLER_PROJECT="jovie-web"/);
    expect(setup).toMatch(/DOPPLER_CONFIG="dev"/);
    expect(setup).toMatch(
      /doppler run --project "\$DOPPLER_PROJECT" --config "\$DOPPLER_CONFIG" --/
    );

    const envRule = read('.claude/rules/environment.md');
    expect(envRule).toContain(
      'doppler run --project jovie-web --config dev --'
    );
    // Bare ambient `doppler run -- <cmd>` must not be the documented local form.
    expect(envRule).not.toMatch(
      /Local\/dev commands should pin[\s\S]*`doppler run -- <command>`/
    );
  });

  it('allows _journal.json updates while blocking existing migration SQL/snapshots', () => {
    const hook = read('.claude/hooks/file-protection-check.sh');
    expect(hook).toContain(
      'append/update drizzle/migrations/meta/_journal.json'
    );
    expect(hook).toContain('drizzle/migrations/.*\\.sql$');
    expect(hook).toContain('drizzle/migrations/meta/.*_snapshot\\.json$');
    // The immutability gate matches SQL + snapshots only — not the journal.
    const gate = hook
      .split('\n')
      .find(line => line.includes('drizzle/migrations/.*\\.sql$'));
    expect(gate, 'migration immutability gate').toBeDefined();
    expect(gate).not.toContain('_journal');
  });

  it('keeps merge-group web shards rejecting zero executed tests', () => {
    const ci = read('.github/workflows/ci.yml');
    const shardLine = ci
      .split('\n')
      .find(
        line =>
          line.trimStart().startsWith('pnpm turbo ') &&
          line.includes('--passWithNoTests=false')
      );
    expect(
      shardLine,
      'merge-group web shard must set passWithNoTests=false'
    ).toBeDefined();

    const integration = read('apps/web/vitest.config.integration.mts');
    expect(integration).toMatch(/passWithNoTests:\s*false/);

    const testingRule = read('.claude/rules/testing.md');
    expect(testingRule).toContain('Zero executed tests are not a pass receipt');
  });
});
