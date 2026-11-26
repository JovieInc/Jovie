/**
 * Outcome residual aggregation for INV-TERMINAL-RECEIPT-1.
 *
 * Regression against `outcome_lane.py`'s `verified-with-residual` premature
 * pass: a mandatory acceptance item left `unverifiable` must hold closure in
 * Validating. Aggregate `pass` requires every mandatory item to pass with an
 * empty residual set. Taste `needs-authority` items are non-mandatory residual
 * (founder-taste receipt owns them) and do not block; other `needs-authority`
 * items fail.
 *
 * Hermetic / pure — no network, clock, or production mutation.
 */

export const OUTCOME_ITEM_STATUSES = Object.freeze([
  'pass',
  'fail',
  'needs-authority',
  'unverifiable',
]);

const TASTE_RE =
  /\b(taste|visual|aesthetic|copy tone|founder(?:'s)? (?:call|decision|judgment)|tim decides)\b/i;

/**
 * @typedef {{
 *   criterion: string,
 *   status: 'pass' | 'fail' | 'needs-authority' | 'unverifiable',
 *   evidence: string,
 *   mandatory?: boolean,
 * }} OutcomeAcceptanceItem
 *
 * @typedef {{
 *   status: 'pass' | 'fail' | 'hold',
 *   reason:
 *     | 'all-items-verified'
 *     | 'mandatory-unverifiable'
 *     | 'items-not-verified'
 *     | 'no-acceptance-items'
 *     | 'verdict-item-malformed',
 *   residual: OutcomeAcceptanceItem[],
 *   items: OutcomeAcceptanceItem[],
 *   completionHolds: string[],
 * }} OutcomeResidualDecision
 */

/**
 * @param {string} criterion
 * @param {string} evidence
 * @returns {boolean}
 */
export function isTasteAuthorityItem(criterion, evidence) {
  return TASTE_RE.test(`${criterion} ${evidence}`);
}

/**
 * Aggregate itemized acceptance into a closure decision.
 *
 * Unlike legacy `verified-with-residual`, any mandatory `unverifiable` item
 * yields `status: 'hold'` (never aggregate pass).
 *
 * @param {readonly unknown[]} items
 * @returns {OutcomeResidualDecision}
 */
export function decideOutcomeResidual(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      status: 'fail',
      reason: 'no-acceptance-items',
      residual: [],
      items: [],
      completionHolds: ['outcome: no acceptance items'],
    };
  }

  /** @type {OutcomeAcceptanceItem[]} */
  const clean = [];
  for (const entry of items) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        status: 'fail',
        reason: 'verdict-item-malformed',
        residual: [],
        items: clean,
        completionHolds: ['outcome: malformed acceptance item'],
      };
    }
    const raw = /** @type {Record<string, unknown>} */ (entry);
    const status = String(raw.status ?? '');
    const criterion = String(raw.criterion ?? '').trim();
    const evidence = String(raw.evidence ?? '').trim();
    if (
      !(
        /** @type {readonly string[]} */ (OUTCOME_ITEM_STATUSES).includes(
          status
        )
      ) ||
      !criterion
    ) {
      return {
        status: 'fail',
        reason: 'verdict-item-malformed',
        residual: [],
        items: clean,
        completionHolds: ['outcome: malformed acceptance item'],
      };
    }
    clean.push({
      criterion: criterion.slice(0, 300),
      status: /** @type {OutcomeAcceptanceItem['status']} */ (status),
      evidence: evidence.slice(0, 600),
      mandatory: raw.mandatory !== false,
    });
  }

  const failed = clean.filter(
    item =>
      item.status === 'fail' ||
      (item.status === 'needs-authority' &&
        !isTasteAuthorityItem(item.criterion, item.evidence))
  );
  if (failed.length > 0) {
    return {
      status: 'fail',
      reason: 'items-not-verified',
      residual: [],
      items: clean,
      completionHolds: failed.map(
        item =>
          `outcome: ${item.status} — ${item.criterion}: ${item.evidence.slice(0, 120)}`
      ),
    };
  }

  const mandatoryUnverifiable = clean.filter(
    item => item.mandatory !== false && item.status === 'unverifiable'
  );
  if (mandatoryUnverifiable.length > 0) {
    // INV-TERMINAL-RECEIPT-1: refuse Done / refuse verified-with-residual pass.
    return {
      status: 'hold',
      reason: 'mandatory-unverifiable',
      residual: mandatoryUnverifiable,
      items: clean,
      completionHolds: mandatoryUnverifiable.map(
        item =>
          `outcome residual unverifiable (mandatory): ${item.criterion}: ${item.evidence.slice(0, 120)}`
      ),
    };
  }

  const residual = clean.filter(
    item =>
      item.status === 'needs-authority' &&
      isTasteAuthorityItem(item.criterion, item.evidence)
  );

  return {
    status: 'pass',
    reason: 'all-items-verified',
    residual,
    items: clean,
    completionHolds: [],
  };
}

/**
 * Whether a residual decision may emit a validation-lifecycle outcome pass
 * receipt (and therefore may advance to Done once deployment is verified).
 *
 * @param {OutcomeResidualDecision} decision
 * @returns {boolean}
 */
export function mayEmitOutcomePassReceipt(decision) {
  return decision.status === 'pass' && decision.reason === 'all-items-verified';
}
