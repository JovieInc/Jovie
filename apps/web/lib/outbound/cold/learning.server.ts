import 'server-only';

import { createHash } from 'node:crypto';
import { desc, eq, like } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contactEvidenceReviews } from '@/lib/db/schema/contacts';
import { leads } from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import { ensureLeadContact, outboundTargetFromLead } from '../ledger.server';
import { cleanOutboundName, outboundMachineDraft } from '../queue';
import type { OutboundChannel, OutboundCopy } from '../types';
import { readOutboundArtifactFacts } from './artifact-facts.server';
import {
  classifyEdit,
  EDIT_PAIR_SCHEMA,
  type EditPair,
  normalizedEditDistance,
  redactCopy,
} from './edit-learning';

/**
 * Edit-pair store. One append-only row per review outcome in the same ledger
 * as founder approvals (`contact_evidence_reviews`), under
 * `outbound:edit:<leadId>`. The snapshot holds the redacted machine draft,
 * the redacted text Tim approved (or his reject reason), the diff categories
 * and the edit distance. No name, address or claim token is stored in it.
 */

export function outboundEditEvidenceKey(leadId: string): string {
  return `outbound:edit:${leadId}`;
}

const EDIT_KEY_PREFIX = 'outbound:edit:';

async function loadLeadForDraft(leadId: string) {
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
      dmCopy: leads.dmCopy,
      latestReleaseDate: leads.latestReleaseDate,
    })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  return lead ?? null;
}

/**
 * Record what Tim did with a machine draft. Never throws: learning must not
 * block an approval or a reject, so failures go to error tracking.
 */
export async function recordOutboundEditPair(input: {
  readonly leadId: string;
  readonly actorUserId: string;
  readonly channel: OutboundChannel | null;
  readonly decision: 'approved' | 'rejected';
  readonly approved: OutboundCopy | null;
  readonly rejectReason: string | null;
  readonly now?: Date;
}): Promise<void> {
  try {
    const now = input.now ?? new Date();
    const lead = await loadLeadForDraft(input.leadId);
    if (!lead) return;
    const target = outboundTargetFromLead(lead);
    const channel: OutboundChannel | null =
      input.channel ??
      (lead.contactEmail ? 'email' : lead.instagramHandle ? 'dm' : null);
    if (!channel || !target.claimUrl) return;
    const artifacts = lead.creatorProfileId
      ? await readOutboundArtifactFacts([lead.creatorProfileId])
      : new Map();
    const name = cleanOutboundName(lead.displayName, lead.linktreeHandle);
    const machine = outboundMachineDraft({
      channel,
      name,
      claimUrl: target.claimUrl,
      dmCopy: lead.dmCopy,
      artifact: lead.creatorProfileId
        ? artifacts.get(lead.creatorProfileId)
        : null,
      latestReleaseDate: lead.latestReleaseDate,
      now,
    });
    const identity = {
      names: [name, lead.displayName ?? '', lead.linktreeHandle].filter(
        Boolean
      ),
      claimUrl: target.claimUrl,
    };
    const before = redactCopy(machine.copy, identity);
    const after = input.approved ? redactCopy(input.approved, identity) : null;
    const pair: EditPair = {
      leadId: lead.id,
      segment: machine.segment,
      templateVersion: machine.templateVersion,
      decision: input.decision,
      before,
      after,
      rejectReason: input.rejectReason,
      at: now,
    };
    const snapshot = {
      schema: EDIT_PAIR_SCHEMA,
      segment: pair.segment,
      templateVersion: pair.templateVersion,
      decision: pair.decision,
      before,
      after,
      rejectReason: pair.rejectReason,
      categories: after ? classifyEdit(before, after) : ['rejected'],
      distance: normalizedEditDistance(pair),
    };
    const contact = await ensureLeadContact(lead);
    if (!contact) return;
    await db.insert(contactEvidenceReviews).values({
      contactId: contact.id,
      dedupeKey: contact.dedupeKey,
      evidenceKey: outboundEditEvidenceKey(lead.id),
      evidenceRevision: createHash('sha256')
        .update(JSON.stringify([before, after, pair.decision]))
        .digest('hex'),
      decision: input.decision === 'approved' ? 'yes' : 'no',
      candidateSnapshot: snapshot,
      actorUserId: input.actorUserId,
      createdAt: now,
    });
  } catch (error) {
    await captureError('Outbound edit pair record failed', error);
  }
}

function readText(
  value: unknown
): { subject: string | null; body: string } | null {
  if (!value || typeof value !== 'object') return null;
  const { subject, body } = value as Record<string, unknown>;
  if (typeof body !== 'string') return null;
  return { subject: typeof subject === 'string' ? subject : null, body };
}

/** Newest edit pairs first. Malformed rows are skipped, not guessed. */
export async function readOutboundEditPairs(limit = 2000): Promise<EditPair[]> {
  const rows = await db
    .select({
      evidenceKey: contactEvidenceReviews.evidenceKey,
      snapshot: contactEvidenceReviews.candidateSnapshot,
      createdAt: contactEvidenceReviews.createdAt,
    })
    .from(contactEvidenceReviews)
    .where(like(contactEvidenceReviews.evidenceKey, `${EDIT_KEY_PREFIX}%`))
    .orderBy(desc(contactEvidenceReviews.createdAt))
    .limit(limit);
  const pairs: EditPair[] = [];
  for (const row of rows) {
    const s = row.snapshot;
    if (s.schema !== EDIT_PAIR_SCHEMA) continue;
    const before = readText(s.before);
    if (
      !before ||
      typeof s.segment !== 'string' ||
      typeof s.templateVersion !== 'string'
    )
      continue;
    const decision = s.decision === 'approved' ? 'approved' : 'rejected';
    pairs.push({
      leadId: row.evidenceKey.slice(EDIT_KEY_PREFIX.length),
      segment: s.segment,
      templateVersion: s.templateVersion,
      decision,
      before,
      after: decision === 'approved' ? readText(s.after) : null,
      rejectReason: typeof s.rejectReason === 'string' ? s.rejectReason : null,
      at: row.createdAt,
    });
  }
  return pairs;
}
