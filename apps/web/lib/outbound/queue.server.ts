import 'server-only';

import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { contactDedupeKey } from '@/lib/contacts/lifecycle';
import { db } from '@/lib/db';
import { contactEvidenceReviews } from '@/lib/db/schema/contacts';
import { leadFunnelEvents, leads } from '@/lib/db/schema/leads';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { outboundTargetFromLead, readOutboundLedger } from './ledger.server';
import {
  buildOutboundRow,
  countOutboundViews,
  type OutboundLeadFacts,
  rankOutboundRows,
} from './queue';
import type { OutboundQueue } from './types';

/** Reply events, once a provider webhook records them (none exist yet). */
const REPLY_EVENT_TYPES = ['replied', 'email_replied', 'dm_replied'];

/** Admin-scale bound; the whole outbound inventory is far below this. */
const OUTBOUND_SCAN_LIMIT = 2000;

/**
 * Every lead that could become, or already is, outbound: everything except
 * leads still in discovery or disqualified by the qualification pass.
 */
export async function getOutboundQueue(
  now = new Date()
): Promise<OutboundQueue> {
  const leadRows = await db
    .select({
      id: leads.id,
      linktreeHandle: leads.linktreeHandle,
      linktreeUrl: leads.linktreeUrl,
      displayName: leads.displayName,
      avatarUrl: leads.avatarUrl,
      contactEmail: leads.contactEmail,
      instagramHandle: leads.instagramHandle,
      hasInstagram: leads.hasInstagram,
      status: leads.status,
      outreachRoute: leads.outreachRoute,
      outreachStatus: leads.outreachStatus,
      dmCopy: leads.dmCopy,
      claimToken: leads.claimToken,
      fitScore: leads.fitScore,
      priorityScore: leads.priorityScore,
      spotifyFollowers: leads.spotifyFollowers,
      latestReleaseDate: leads.latestReleaseDate,
      discoveryQuery: leads.discoveryQuery,
      createdAt: leads.createdAt,
      ingestedAt: leads.ingestedAt,
      signupAt: leads.signupAt,
      signupUserId: leads.signupUserId,
      paidAt: leads.paidAt,
      creatorProfileId: leads.creatorProfileId,
      profileUsername: creatorProfiles.username,
      profileAvatarUrl: creatorProfiles.avatarUrl,
    })
    .from(leads)
    .leftJoin(creatorProfiles, eq(creatorProfiles.id, leads.creatorProfileId))
    .where(notInArray(leads.status, ['discovered', 'disqualified']))
    .limit(OUTBOUND_SCAN_LIMIT);

  const leadIds = leadRows.map(row => row.id);
  const dedupeKeys = new Map(
    leadRows.map(row => [
      row.id,
      contactDedupeKey({
        email: row.contactEmail,
        handle: row.linktreeHandle,
      }),
    ])
  );
  const keys = [...dedupeKeys.values()].filter(
    (key): key is string => key !== null
  );

  const [ledger, certifications, replies] = await Promise.all([
    readOutboundLedger(leadIds),
    keys.length
      ? db
          .select({ dedupeKey: contactEvidenceReviews.dedupeKey })
          .from(contactEvidenceReviews)
          .where(
            and(
              inArray(contactEvidenceReviews.dedupeKey, keys),
              eq(contactEvidenceReviews.evidenceKey, 'profile:certification')
            )
          )
      : Promise.resolve([]),
    leadIds.length
      ? db
          .select({ leadId: leadFunnelEvents.leadId })
          .from(leadFunnelEvents)
          .where(
            and(
              inArray(leadFunnelEvents.leadId, leadIds),
              inArray(leadFunnelEvents.eventType, REPLY_EVENT_TYPES)
            )
          )
      : Promise.resolve([]),
  ]);
  const certified = new Set(certifications.map(row => row.dedupeKey));
  const replied = new Set(replies.map(row => row.leadId));

  const built = leadRows.map(row => {
    const dedupeKey = dedupeKeys.get(row.id) ?? null;
    const facts: OutboundLeadFacts = {
      ...row,
      certified: dedupeKey !== null && certified.has(dedupeKey),
      replied: replied.has(row.id),
    };
    return buildOutboundRow({
      facts,
      target: outboundTargetFromLead(row),
      dedupeKey,
      ledger: ledger.get(row.id) ?? [],
      now,
    });
  });
  const rows = rankOutboundRows(
    built,
    new Map(leadRows.map(row => [row.id, row.priorityScore]))
  );
  return {
    generatedAt: now.toISOString(),
    rows,
    counts: countOutboundViews(rows),
  };
}
