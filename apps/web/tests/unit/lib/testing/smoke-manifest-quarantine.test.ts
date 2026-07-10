import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESKTOP_SMOKE_SPECS } from '@/tests/e2e/smoke-manifest';

/**
 * Guardrail for JOV-4033: the PR Fast Feedback smoke job runs
 * `playwright.config.smoke.ts` without quarantine filtering. Specs listed in
 * both the smoke manifest and the e2e quarantine ledger re-enter the merge
 * gate and produce job-level flake.
 */
describe('desktop smoke manifest vs quarantine ledger', () => {
  it('does not gate on e2e specs that are actively quarantined', () => {
    const ledgerPath = resolve(process.cwd(), 'tests/quarantine.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
      entries?: ReadonlyArray<{
        kind?: string;
        path?: string;
      }>;
    };

    const quarantinedBasenames = new Set(
      (ledger.entries ?? [])
        .filter(entry => entry.kind === 'e2e' && typeof entry.path === 'string')
        .map(entry => entry.path!.split('/').pop()!)
        .filter(Boolean)
    );

    const collisions = DESKTOP_SMOKE_SPECS.filter(spec =>
      quarantinedBasenames.has(spec)
    );

    expect(
      collisions,
      `Remove quarantined specs from DESKTOP_SMOKE_SPECS (or un-quarantine them first): ${collisions.join(', ')}`
    ).toEqual([]);
  });
});
