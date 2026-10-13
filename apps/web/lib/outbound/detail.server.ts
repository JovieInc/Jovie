import 'server-only';

import { eq } from 'drizzle-orm';
import { getContactCertificationInspection } from '@/lib/admin/contact-certification';
import { getCanonicalContactByKey } from '@/lib/admin/contacts';
import type { ContactCertificationInspection } from '@/lib/contacts/certification';
import { contactDedupeKey } from '@/lib/contacts/lifecycle';
import { db } from '@/lib/db';
import { leads } from '@/lib/db/schema/leads';
import {
  type OutboundLeadIdentity,
  recordOutboundDecision,
} from './ledger.server';
import type {
  OutboundBulkAction,
  OutboundCopy,
  OutboundRefusal,
  OutboundRejectReason,
} from './types';

export async function loadOutboundLead(
  leadId: string
): Promise<OutboundLeadIdentity | null> {
  const [lead] = await db
    .select({
      id: leads.id,
      linktreeHandle: leads.linktreeHandle,
      displayName: leads.displayName,
      contactEmail: leads.contactEmail,
      instagramHandle: leads.instagramHandle,
      creatorProfileId: leads.creatorProfileId,
      claimToken: leads.claimToken,
      avatarUrl: leads.avatarUrl,
    })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  return lead ?? null;
}

/** The JOV-7321 per-fact inspection for the lead's canonical contact. */
export async function getOutboundCertification(
  lead: OutboundLeadIdentity
): Promise<ContactCertificationInspection | null> {
  const key = contactDedupeKey({
    email: lead.contactEmail,
    handle: lead.linktreeHandle,
  });
  if (!key) return null;
  const contact = await getCanonicalContactByKey(key);
  return contact ? getContactCertificationInspection(contact) : null;
}

type Result =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: OutboundRefusal };

/**
 * Approve one target and one exact message revision. Requires the current
 * profile facts to be certified; both rows are founder decisions.
 */
export async function approveOutbound(input: {
  readonly leadId: string;
  readonly expectedTargetRevision: string;
  readonly copy: OutboundCopy;
  readonly actorUserId: string;
}): Promise<Result> {
  const lead = await loadOutboundLead(input.leadId);
  if (!lead) return { ok: false, reason: 'not_found' };
  if (input.copy.channel === 'email' && !lead.contactEmail)
    return { ok: false, reason: 'no_channel' };
  if (input.copy.channel === 'dm' && !lead.instagramHandle)
    return { ok: false, reason: 'no_channel' };
  const certification = await getOutboundCertification(lead);
  if (certification?.status !== 'certified_for_outreach')
    return { ok: false, reason: 'not_certified' };
  const target = await recordOutboundDecision({
    lead,
    actorUserId: input.actorUserId,
    decision: {
      kind: 'target',
      decision: 'yes',
      expectedTargetRevision: input.expectedTargetRevision,
    },
  });
  if (!target.ok) return target;
  return recordOutboundDecision({
    lead,
    actorUserId: input.actorUserId,
    decision: {
      kind: 'copy',
      decision: 'yes',
      expectedTargetRevision: input.expectedTargetRevision,
      copy: input.copy,
    },
  });
}

/** Save an edited message as a draft; any earlier approval is withdrawn. */
export async function saveOutboundCopy(input: {
  readonly leadId: string;
  readonly expectedTargetRevision: string;
  readonly copy: OutboundCopy;
  readonly actorUserId: string;
}): Promise<Result> {
  const lead = await loadOutboundLead(input.leadId);
  if (!lead) return { ok: false, reason: 'not_found' };
  return recordOutboundDecision({
    lead,
    actorUserId: input.actorUserId,
    decision: {
      kind: 'copy',
      decision: 'unsure',
      expectedTargetRevision: input.expectedTargetRevision,
      copy: input.copy,
    },
  });
}

/** Hold or reject one target. Bulk callers loop this per item. */
export async function decideOutboundTarget(input: {
  readonly leadId: string;
  readonly expectedTargetRevision: string;
  readonly action: OutboundBulkAction;
  readonly reason: OutboundRejectReason | null;
  readonly note: string | null;
  readonly actorUserId: string;
}): Promise<Result> {
  const lead = await loadOutboundLead(input.leadId);
  if (!lead) return { ok: false, reason: 'not_found' };
  return recordOutboundDecision({
    lead,
    actorUserId: input.actorUserId,
    decision: {
      kind: 'target',
      decision: input.action === 'hold' ? 'unsure' : 'no',
      expectedTargetRevision: input.expectedTargetRevision,
      reason: input.reason,
      note: input.note,
    },
  });
}
