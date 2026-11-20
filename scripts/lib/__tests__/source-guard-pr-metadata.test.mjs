import { expect, it } from 'vitest';
import { selectSourceGuards } from '../../ci-fast-lanes.mjs';

const selected = (event, files) =>
  selectSourceGuards(event, files).map(guard => guard.id);

it.each([
  'scripts/lib/__tests__/api-quota-sampling.test.mjs',
  'scripts/lib/guard-test-network-guard.mjs',
  'scripts/lib/guard-test-network.ratchet.gen.json',
])(
  'checks the existing guard-test network ratchet during preflight for %s',
  file => {
    const guard = selectSourceGuards('pull_request', [file]).find(
      candidate => candidate.id === 'test-hygiene'
    );
    expect(guard).toBeDefined();
    expect(guard.command).toContain(
      'node scripts/lib/__tests__/guard-test-network-guard.test.mjs'
    );
    expect(guard.prOnly).toBe(false);
  }
);

it.each([
  [
    'pull_request',
    [
      'web-source-read-tests',
      'script-contracts',
      'merged-with-base-invariants',
      'gate-weakening-detector',
    ],
  ],
  ['merge_group', []],
  ['push', []],
])(
  'runs ci-schedule-inventory and automation-registry on %s when a workflow changes',
  (event, pr) => {
    expect(
      selected(event, ['.github/workflows/upstash-quota-headroom.yml'])
    ).toEqual([
      'ci-schedule-inventory',
      'automation-registry',
      'anti-slop',
      'external-api-guard',
      ...pr,
    ]);
  }
);
