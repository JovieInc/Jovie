import { expect, it } from 'vitest';
import { selectSourceGuards } from '../../ci-fast-lanes.mjs';

const selected = (event, files) =>
  selectSourceGuards(event, files).map(guard => guard.id);

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
