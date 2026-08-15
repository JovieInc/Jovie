import { describe, expect, it } from 'vitest';
import {
  attestationMatchesRepairScope,
  extractProductionUnboundRepairAttestation,
  PRODUCTION_UNBOUND_REPAIR_ATTESTATION_MARKER,
  PRODUCTION_UNBOUND_REPAIR_ATTESTATION_SCHEMA,
  renderProductionUnboundRepairAttestation,
} from '../production-unbound-repair-attestation.mjs';

const MAIN = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);

function receipt(overrides = {}) {
  return {
    schema: PRODUCTION_UNBOUND_REPAIR_ATTESTATION_SCHEMA,
    kind: 'production-release-repair',
    condition: 'production-deployment-unbound',
    pr: 16009,
    head: HEAD,
    mainSha: MAIN,
    deploymentsAllowed: false,
    ...overrides,
  };
}

describe('production-unbound repair attestation', () => {
  it('binds the typed repair exception to one PR, head, and current main', () => {
    const body = renderProductionUnboundRepairAttestation(receipt());
    expect(body).toContain(PRODUCTION_UNBOUND_REPAIR_ATTESTATION_MARKER);
    expect(extractProductionUnboundRepairAttestation(body)).toMatchObject(
      receipt()
    );
    expect(
      attestationMatchesRepairScope(body, {
        pr: 16009,
        head: HEAD,
        mainSha: MAIN,
      })
    ).toBe(true);
  });

  it.each([
    [
      'legacy loose marker',
      '<!-- production-unbound-repair:production-deployment-unbound:' +
        MAIN +
        ' -->',
    ],
    [
      'wrong PR',
      renderProductionUnboundRepairAttestation(receipt({ pr: 16010 })),
    ],
    [
      'wrong head',
      renderProductionUnboundRepairAttestation(
        receipt({ head: 'c'.repeat(40) })
      ),
    ],
    [
      'wrong main',
      renderProductionUnboundRepairAttestation(
        receipt({ mainSha: 'd'.repeat(40) })
      ),
    ],
    ['ordinary kind', JSON.stringify(receipt({ kind: 'ordinary-fix' }))],
  ])('fails closed for %s', (_label, body) => {
    expect(
      attestationMatchesRepairScope(body, {
        pr: 16009,
        head: HEAD,
        mainSha: MAIN,
      })
    ).toBe(false);
  });
});
