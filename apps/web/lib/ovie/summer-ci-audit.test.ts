import { describe, expect, it } from 'vitest';
import fixture from './fixtures/summer-ci-audit-v2.json';
import { createSummerCiAuditV2Schema } from './summer-ci-audit';

const classIds = [
  'merge-group-flake-baseline-ratchet',
  'controller-cascade-coalescing',
  'auto-enroll-self-cancel-churn',
  'controller-check-run-pagination-cap',
  'obsolete-unaffected-native-lanes',
  'affected-only-unit-selection',
] as const;

const schema = createSummerCiAuditV2Schema(classIds);

describe('summer CI audit v2 mapping', () => {
  it('accepts the one mapped class as open or partial', () => {
    const parsed = schema.parse(fixture);
    expect(parsed.classes).toEqual([
      {
        id: 'affected-only-unit-selection',
        state: 'open',
        owner: 'ci-risk-classifier',
        'impact-rule': 'affected-unit-paths-only',
        action: 'remediate-selected-ci-audit-class',
        handle: 'audit:affected-only-units',
      },
    ]);
    expect(parsed.excludedClasses.map(row => row.id)).toEqual([
      'auto-enroll-self-cancel-churn',
      'controller-cascade-coalescing',
      'controller-check-run-pagination-cap',
      'merge-group-flake-baseline-ratchet',
      'obsolete-unaffected-native-lanes',
    ]);
    expect(
      schema.parse({
        ...fixture,
        classes: [{ ...fixture.classes[0], state: 'partial' }],
      }).classes[0]?.state
    ).toBe('partial');
  });

  it('rejects forged open classes and a catalog that drops the accepted id', () => {
    expect(
      schema.safeParse({
        ...fixture,
        classes: [
          {
            ...fixture.classes[0],
            id: 'controller-cascade-coalescing',
          },
        ],
      }).success
    ).toBe(false);
    expect(schema.safeParse({ ...fixture, classes: [] }).success).toBe(false);
    expect(
      schema.safeParse({
        ...fixture,
        excludedClasses: [...fixture.excludedClasses].reverse(),
      }).success
    ).toBe(false);

    const withoutAccepted = createSummerCiAuditV2Schema([
      'merge-group-flake-baseline-ratchet',
      'controller-cascade-coalescing',
    ] as const);
    expect(
      withoutAccepted.safeParse({
        ...fixture,
        excludedClasses: [
          {
            id: 'controller-cascade-coalescing',
            reason: 'mapping-unaccepted',
          },
        ],
      }).success
    ).toBe(false);
  });
});
