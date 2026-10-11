/**
 * Payment instrument safety guards (JOV-5311).
 *
 * The ledger persists label + last4 only. These guards reject anything that
 * looks like a full PAN or account number at the module boundary, so a bad
 * source adapter cannot smuggle credentials into the projection.
 */

import type { CostLedgerInstrument } from './contract';

const PAN_PATTERN = /\d{8,}/;

export function assertPaymentInstrumentSafety(
  instrument: CostLedgerInstrument
): CostLedgerInstrument {
  if (instrument.last4 !== undefined) {
    if (!/^\d{1,4}$/.test(instrument.last4)) {
      throw new Error(
        'payment instrument last4 must be 1-4 digits; refusing to persist longer fragments'
      );
    }
  }
  for (const field of [instrument.label, instrument.ownerEntity]) {
    if (typeof field === 'string' && PAN_PATTERN.test(field)) {
      throw new Error(
        'payment instrument fields must not contain 8+ consecutive digits; refusing possible PAN'
      );
    }
  }
  return instrument;
}
