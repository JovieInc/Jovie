import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type AcquisitionFact,
  type PaidAcquisitionReceipt,
  type PaidOrderFact,
  reconcilePaidAcquisition,
} from './reconciliation';

interface PaidOrderRow extends Record<string, unknown> {
  logical_order_id: string;
  user_id: string;
  gross_amount_cents: number;
  currency: string;
  paid_at: string;
  acquisition_id: string | null;
  refunded_amount_cents: number;
  disputed_amount_cents: number;
}

interface AcquisitionRow extends Record<string, unknown> {
  acquisition_id: string;
  user_id: string | null;
  captured_at: string;
  consent_revoked_at: string | null;
  first_touch: Record<string, unknown>;
}

/**
 * Source-ledger reconciliation query. Every unique successful Stripe invoice
 * remains present even when no acquisition fact matches. Creator earnings and
 * referral commissions are intentionally absent: this reads only Jovie's
 * subscription billing audit ledger.
 */
export async function getPaidAcquisitionEvidence(
  asOf = new Date()
): Promise<PaidAcquisitionReceipt[]> {
  const paidRows = await db.execute<PaidOrderRow>(drizzleSql`
    WITH paid AS (
      SELECT DISTINCT ON (metadata->>'logicalOrderId')
        metadata->>'logicalOrderId' AS logical_order_id,
        user_id,
        (metadata->>'grossAmountCents')::integer AS gross_amount_cents,
        metadata->>'currency' AS currency,
        created_at AS paid_at,
        NULLIF(metadata->>'acquisitionId', '') AS acquisition_id
      FROM billing_audit_log
      WHERE event_type = 'payment_succeeded'
        AND metadata ? 'logicalOrderId'
      ORDER BY metadata->>'logicalOrderId', created_at ASC
    ), reversals AS (
      SELECT metadata->>'invoiceId' AS logical_order_id,
        COALESCE(MAX((metadata->>'amountRefunded')::integer)
          FILTER (WHERE event_type = 'charge_refunded'), 0) AS refunded_amount_cents,
        COALESCE(MAX((metadata->>'disputedAmountCents')::integer)
          FILTER (WHERE event_type = 'charge_disputed'), 0) AS disputed_amount_cents
      FROM billing_audit_log
      WHERE event_type IN ('charge_refunded', 'charge_disputed')
      GROUP BY metadata->>'invoiceId'
    )
    SELECT paid.*,
      COALESCE(reversals.refunded_amount_cents, 0)::integer AS refunded_amount_cents,
      COALESCE(reversals.disputed_amount_cents, 0)::integer AS disputed_amount_cents
    FROM paid
    LEFT JOIN reversals USING (logical_order_id)
    ORDER BY paid.paid_at ASC, paid.logical_order_id ASC
  `);
  const acquisitionRows = await db.execute<AcquisitionRow>(drizzleSql`
    SELECT id AS acquisition_id, user_id, captured_at, consent_revoked_at, first_touch
    FROM acquisition_journeys
    WHERE captured_at <= ${asOf}
  `);

  const orders: PaidOrderFact[] = paidRows.rows.map(row => ({
    logicalOrderId: row.logical_order_id,
    userId: row.user_id,
    grossAmountCents: Number(row.gross_amount_cents),
    currency: row.currency,
    paidAt: new Date(row.paid_at).toISOString(),
    ...(row.acquisition_id ? { acquisitionId: row.acquisition_id } : {}),
    refundedAmountCents: Number(row.refunded_amount_cents),
    disputedAmountCents: Number(row.disputed_amount_cents),
  }));
  const acquisitions: AcquisitionFact[] = acquisitionRows.rows.map(row => ({
    acquisitionId: row.acquisition_id,
    ...(row.user_id ? { userId: row.user_id } : {}),
    capturedAt: new Date(row.captured_at).toISOString(),
    ...(row.consent_revoked_at
      ? { consentRevokedAt: new Date(row.consent_revoked_at).toISOString() }
      : {}),
    firstTouch: row.first_touch,
  }));

  return reconcilePaidAcquisition(orders, acquisitions, asOf.toISOString());
}
