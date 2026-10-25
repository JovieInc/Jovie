import { and, inArray, isNotNull } from 'drizzle-orm';
import { leads } from '@/lib/db/schema/leads';

/**
 * A lead is approved for outreach once it has been approved, whether or not it
 * has since been ingested. Ingestion advances `status` to `ingested` after
 * approval, so selecting `status = 'approved'` alone made every ingested lead
 * unreachable. `approvedAt` proves the lead passed the approval step.
 */
export const outreachApprovedWhere = and(
  inArray(leads.status, ['approved', 'ingested']),
  isNotNull(leads.approvedAt)
);
