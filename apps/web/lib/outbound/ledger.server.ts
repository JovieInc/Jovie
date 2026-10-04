import 'server-only';

import { desc, inArray } from 'drizzle-orm';
import { getAppUrl } from '@/constants/domains';
import { contactDedupeKey } from '@/lib/contacts/lifecycle';
import { db } from '@/lib/db';
import { contactEvidenceReviews, contacts } from '@/lib/db/schema/contacts';
import {
  type OutboundLedgerRow,
  type OutboundTarget,
  outboundCopyEvidenceKey,
  outboundCopyRevision,
  outboundTargetEvidenceKey,
  outboundTargetRevision,
} from './approval';
import type {
  OutboundCopy,
  OutboundDecision,
  OutboundRejectReason,
} from './types';

/** The lead columns a target revision binds. */
export interface OutboundLeadIdentity {
  readonly id: string;
  readonly linktreeHandle: string;
  readonly displayName: string | null;
  readonly contactEmail: string | null;
  readonly instagramHandle: string | null;
  readonly creatorProfileId: string | null;
  readonly claimToken: string | null;
  readonly avatarUrl?: string | null;
}

export function outboundTargetFromLead(
  lead: OutboundLeadIdentity
): OutboundTarget {
  return {
    leadId: lead.id,
    displayName: lead.displayName?.trim() || lead.linktreeHandle,
    contactEmail: lead.contactEmail,
    instagramHandle: lead.instagramHandle,
    creatorProfileId: lead.creatorProfileId,
    claimUrl: lead.claimToken ? getAppUrl(`/claim/${lead.claimToken}`) : null,
  };
}

/** Ledger rows for many leads, newest first. */
export async function readOutboundLedger(
  leadIds: readonly string[]
): Promise<Map<string, OutboundLedgerRow[]>> {
  const byLead = new Map<string, OutboundLedgerRow[]>();
  if (leadIds.length === 0) return byLead;
  const keys = leadIds.flatMap(id => [
    outboundTargetEvidenceKey(id),
    outboundCopyEvidenceKey(id),
  ]);
  const rows = await db
    .select({
      evidenceKey: contactEvidenceReviews.evidenceKey,
      evidenceRevision: contactEvidenceReviews.evidenceRevision,
      decision: contactEvidenceReviews.decision,
      snapshot: contactEvidenceReviews.candidateSnapshot,
      actorUserId: contactEvidenceReviews.actorUserId,
      createdAt: contactEvidenceReviews.createdAt,
    })
    .from(contactEvidenceReviews)
    .where(inArray(contactEvidenceReviews.evidenceKey, keys))
    .orderBy(desc(contactEvidenceReviews.createdAt));
  for (const row of rows) {
    const leadId = row.evidenceKey.split(':').at(-1) ?? '';
    const list = byLead.get(leadId) ?? [];
    list.push(row);
    byLead.set(leadId, list);
  }
  return byLead;
}

async function ensureLeadContact(lead: OutboundLeadIdentity) {
  const dedupeKey =
    contactDedupeKey({
      email: lead.contactEmail,
      handle: lead.linktreeHandle,
    }) ?? `lead:${lead.id}`;
  const [row] = await db
    .insert(contacts)
    .values({
      dedupeKey,
      displayName: lead.displayName,
      emailNormalized: lead.contactEmail?.trim().toLowerCase() ?? null,
      primaryHandle: lead.linktreeHandle,
      avatarUrl: lead.avatarUrl ?? null,
      leadId: lead.id,
      creatorProfileId: lead.creatorProfileId,
    })
    .onConflictDoUpdate({
      target: contacts.dedupeKey,
      set: { leadId: lead.id, updatedAt: new Date() },
    })
    .returning({ id: contacts.id, dedupeKey: contacts.dedupeKey });
  return row;
}

export type OutboundDecisionInput =
  | {
      readonly kind: 'target';
      readonly decision: OutboundDecision;
      readonly expectedTargetRevision: string;
      readonly reason?: OutboundRejectReason | null;
      readonly note?: string | null;
    }
  | {
      readonly kind: 'copy';
      readonly decision: OutboundDecision;
      readonly expectedTargetRevision: string;
      readonly copy: OutboundCopy;
    };

/**
 * Append one founder decision. The caller passes the target revision it
 * showed Tim; a mismatch means the person changed under him and is refused.
 */
export async function recordOutboundDecision(input: {
  readonly lead: OutboundLeadIdentity;
  readonly actorUserId: string;
  readonly decision: OutboundDecisionInput;
}): Promise<
  | { readonly ok: true; readonly revision: string }
  | { readonly ok: false; readonly reason: 'stale_target' | 'invalid' }
> {
  const target = outboundTargetFromLead(input.lead);
  const targetRevision = outboundTargetRevision(target);
  const decision = input.decision;
  if (decision.expectedTargetRevision !== targetRevision)
    return { ok: false, reason: 'stale_target' };
  if (!input.actorUserId) return { ok: false, reason: 'invalid' };

  let evidenceKey: string;
  let evidenceRevision: string;
  let snapshot: Record<string, unknown>;
  if (decision.kind === 'target') {
    if (decision.decision === 'no' && !decision.reason)
      return { ok: false, reason: 'invalid' };
    evidenceKey = outboundTargetEvidenceKey(target.leadId);
    evidenceRevision = targetRevision;
    snapshot = {
      schema: 'outbound-target/v1',
      target,
      reason: decision.decision === 'no' ? decision.reason : null,
      note: decision.note?.trim() || null,
    };
  } else {
    const body = decision.copy.body;
    if (!body.trim() || body.length > 4000)
      return { ok: false, reason: 'invalid' };
    if (
      decision.decision === 'yes' &&
      target.claimUrl &&
      !body.includes(target.claimUrl)
    )
      return { ok: false, reason: 'invalid' };
    evidenceKey = outboundCopyEvidenceKey(target.leadId);
    evidenceRevision = outboundCopyRevision(targetRevision, decision.copy);
    snapshot = {
      schema: 'outbound-copy/v1',
      targetRevision,
      channel: decision.copy.channel,
      subject: decision.copy.subject,
      body,
    };
  }

  const contact = await ensureLeadContact(input.lead);
  await db.insert(contactEvidenceReviews).values({
    contactId: contact.id,
    dedupeKey: contact.dedupeKey,
    evidenceKey,
    evidenceRevision,
    decision: decision.decision,
    candidateSnapshot: snapshot,
    actorUserId: input.actorUserId,
  });
  return { ok: true, revision: evidenceRevision };
}
