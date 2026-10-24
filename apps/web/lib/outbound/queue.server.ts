import 'server-only';

import { and, sql as drizzleSql, eq, inArray, notInArray } from 'drizzle-orm';
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

/** Reply milestones recorded by provider webhooks, including Instantly. */
const REPLY_EVENT_TYPES = ['replied', 'email_replied', 'dm_replied'];

/** Admin-scale bound; the whole outbound inventory is far below this. */
const OUTBOUND_SCAN_LIMIT = 2000;

/**
 * Which required evidence classes each built profile has, using the same
 * source rules as the certification inspection (getContactCertificationInspection)
 * so a row is "ready" only when certification could clear. One batched read.
 */
async function readEvidenceClasses(
  profileIds: readonly string[]
): Promise<Map<string, string[]>> {
  if (!profileIds.length) return new Map();
  const ids = drizzleSql.join(
    profileIds.map(id => drizzleSql`${id}::uuid`),
    drizzleSql`, `
  );
  const result = await db.execute<{
    id: string;
    dsp: boolean;
    catalog: boolean;
    search: boolean;
    reachability: boolean;
  }>(drizzleSql`
    select p.id::text as id,
      (exists (select 1 from dsp_artist_matches d where d.creator_profile_id = p.id)
        or exists (select 1 from profile_surfaces s where s.creator_profile_id = p.id
          and s.retired_at is null and s.kind not in ('jovie', 'website', 'social'))) as dsp,
      (exists (select 1 from discog_releases r where r.creator_profile_id = p.id)
        or exists (select 1 from discog_recordings r where r.creator_profile_id = p.id)
        or exists (select 1 from dsp_catalog_scans c where c.creator_profile_id = p.id
          and c.status = 'completed')) as catalog,
      exists (select 1 from profile_search_runs r
        join profile_search_queries q on q.id = r.query_id
        where q.creator_profile_id = p.id) as search,
      exists (select 1 from profile_surfaces s where s.creator_profile_id = p.id
        and s.retired_at is null and s.kind in ('website', 'social')) as reachability
    from creator_profiles p
    where p.id in (${ids})
  `);
  const classes = new Map<string, string[]>();
  for (const row of result.rows) {
    classes.set(
      row.id,
      (['dsp', 'catalog', 'search', 'reachability'] as const).filter(
        key => row[key] === true
      )
    );
  }
  return classes;
}

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
      bio: leads.bio,
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
      fitScoreBreakdown: leads.fitScoreBreakdown,
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

  const profileIds = [
    ...new Set(
      leadRows
        .map(row => row.creatorProfileId)
        .filter((id): id is string => id !== null)
    ),
  ];
  const [ledger, certifications, replies, evidence] = await Promise.all([
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
    readEvidenceClasses(profileIds),
  ]);
  const certified = new Set(certifications.map(row => row.dedupeKey));
  const replied = new Set(replies.map(row => row.leadId));

  const built = leadRows.map(row => {
    const dedupeKey = dedupeKeys.get(row.id) ?? null;
    const facts: OutboundLeadFacts = {
      ...row,
      certified: dedupeKey !== null && certified.has(dedupeKey),
      replied: replied.has(row.id),
      evidenceClasses: row.creatorProfileId
        ? (evidence.get(row.creatorProfileId) ?? [])
        : null,
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
