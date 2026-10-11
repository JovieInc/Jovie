export const ACQUISITION_ATTRIBUTION_MODEL_VERSION =
  'jovie.self-serve-first-touch/v1' as const;
export const ACQUISITION_LOOKBACK_DAYS = 90;

export type AttributionMethod =
  | 'exact_order_correlation'
  | 'linked_authorized_identity'
  | 'unmatched';

export interface PaidOrderFact {
  logicalOrderId: string;
  userId: string;
  grossAmountCents: number;
  currency: string;
  paidAt: string;
  acquisitionId?: string;
  refundedAmountCents?: number;
  disputedAmountCents?: number;
}

export interface AcquisitionFact {
  acquisitionId: string;
  userId?: string;
  capturedAt: string;
  consentRevokedAt?: string;
  firstTouch: Readonly<Record<string, unknown>>;
}

export interface PaidAcquisitionReceipt {
  contractVersion: 'jovie.paid-acquisition-evidence/v1';
  logicalOrderId: string;
  userId: string;
  source: Readonly<Record<string, unknown>> | 'unknown';
  acquisitionId: string | null;
  matchingMethod: AttributionMethod;
  confidence: 'exact' | 'linked' | 'unmatched';
  modelVersion: typeof ACQUISITION_ATTRIBUTION_MODEL_VERSION;
  lookbackDays: number;
  identityScope: 'consented_first_party_browser' | 'none';
  availableHistory: { from: string | null; to: string };
  grossAmountCents: number;
  refundAmountCents: number;
  disputeAmountCents: number;
  netAmountCents: number;
  currency: string;
  causalClaim: false;
}

/** Deterministic, replayable attribution over stored facts only. */
export function reconcilePaidAcquisition(
  orders: readonly PaidOrderFact[],
  acquisitions: readonly AcquisitionFact[],
  asOf: string
): PaidAcquisitionReceipt[] {
  const byId = new Map(acquisitions.map(fact => [fact.acquisitionId, fact]));
  const byUser = new Map<string, AcquisitionFact>();
  for (const fact of [...acquisitions].sort((a, b) =>
    a.capturedAt.localeCompare(b.capturedAt)
  )) {
    if (fact.userId && !byUser.has(fact.userId)) byUser.set(fact.userId, fact);
  }
  const uniqueOrders = new Map<string, PaidOrderFact>();
  for (const order of orders) {
    if (!uniqueOrders.has(order.logicalOrderId))
      uniqueOrders.set(order.logicalOrderId, order);
  }

  return [...uniqueOrders.values()].map(order => {
    const exact = order.acquisitionId
      ? byId.get(order.acquisitionId)
      : undefined;
    const linked = exact ?? byUser.get(order.userId);
    const elapsedMs = linked
      ? Date.parse(order.paidAt) - Date.parse(linked.capturedAt)
      : -1;
    const eligible =
      linked &&
      !linked.consentRevokedAt &&
      linked.userId !== undefined &&
      linked.userId === order.userId &&
      elapsedMs >= 0 &&
      elapsedMs <= ACQUISITION_LOOKBACK_DAYS * 86_400_000;
    const matched = eligible ? linked : undefined;
    const method: AttributionMethod = matched
      ? exact
        ? 'exact_order_correlation'
        : 'linked_authorized_identity'
      : 'unmatched';
    const refundAmountCents = Math.min(
      order.grossAmountCents,
      Math.max(0, order.refundedAmountCents ?? 0)
    );
    const disputeAmountCents = Math.min(
      order.grossAmountCents - refundAmountCents,
      Math.max(0, order.disputedAmountCents ?? 0)
    );

    return {
      contractVersion: 'jovie.paid-acquisition-evidence/v1',
      logicalOrderId: order.logicalOrderId,
      userId: order.userId,
      source: matched?.firstTouch ?? 'unknown',
      acquisitionId: matched?.acquisitionId ?? null,
      matchingMethod: method,
      confidence:
        method === 'exact_order_correlation'
          ? 'exact'
          : method === 'linked_authorized_identity'
            ? 'linked'
            : 'unmatched',
      modelVersion: ACQUISITION_ATTRIBUTION_MODEL_VERSION,
      lookbackDays: ACQUISITION_LOOKBACK_DAYS,
      identityScope: matched ? 'consented_first_party_browser' : 'none',
      availableHistory: { from: matched?.capturedAt ?? null, to: asOf },
      grossAmountCents: order.grossAmountCents,
      refundAmountCents,
      disputeAmountCents,
      netAmountCents:
        order.grossAmountCents - refundAmountCents - disputeAmountCents,
      currency: order.currency,
      causalClaim: false,
    };
  });
}
