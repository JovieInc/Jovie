import 'server-only';

import { and, desc, eq, gte, type SQL } from 'drizzle-orm';
import {
  isMissingConnectorSchemaError,
  isMissingSignalTypeColumnError,
} from '@/lib/connectors/schema-errors';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { tourDates } from '@/lib/db/schema/tour';
import { logger } from '@/lib/utils/logger';
import { buildOpportunityInboxData } from './opportunity-inbox-mapper';
import { mapTourDateRowToInboxItem } from './opportunity-inbox-tour-dates';
import type {
  OpportunityInboxData,
  OpportunityInboxTourDates,
} from './opportunity-inbox-types';

const EMPTY_INBOX_DATA = buildOpportunityInboxData([]);

const PENDING_TOUR_DATE_LIMIT = 20;
const CONFIRMED_TOUR_DATE_LIMIT = 10;
const REJECTED_TOUR_DATE_LIMIT = 20;

const TOUR_DATE_SELECTION = {
  id: tourDates.id,
  title: tourDates.title,
  startDate: tourDates.startDate,
  startTime: tourDates.startTime,
  venueName: tourDates.venueName,
  city: tourDates.city,
  region: tourDates.region,
  country: tourDates.country,
  provider: tourDates.provider,
  confirmationStatus: tourDates.confirmationStatus,
};

const BASE_SELECTION = {
  id: suggestedActions.id,
  kind: suggestedActions.kind,
  payload: suggestedActions.payload,
  rationale: suggestedActions.rationale,
  createdAt: suggestedActions.createdAt,
} as const;

function pendingForUser(userId: string): SQL | undefined {
  return and(
    eq(suggestedActions.userId, userId),
    eq(suggestedActions.status, 'pending')
  );
}

/**
 * Detected tour-date signals awaiting the creator's confirm/reject call, plus
 * the visible confirmed list and the hidden rejected bucket.
 *
 * Fail-soft: any query error degrades to empty sections so the inbox feed
 * still renders (same posture as the suggested-actions migration-drift guard).
 */
async function loadTourDateSections(
  profileId: string
): Promise<OpportunityInboxTourDates> {
  try {
    const now = new Date();

    const [pending, confirmed, rejected] = await Promise.all([
      db
        .select(TOUR_DATE_SELECTION)
        .from(tourDates)
        .where(
          and(
            eq(tourDates.profileId, profileId),
            eq(tourDates.confirmationStatus, 'pending')
          )
        )
        .orderBy(tourDates.startDate)
        .limit(PENDING_TOUR_DATE_LIMIT),
      db
        .select(TOUR_DATE_SELECTION)
        .from(tourDates)
        .where(
          and(
            eq(tourDates.profileId, profileId),
            eq(tourDates.confirmationStatus, 'confirmed'),
            gte(tourDates.startDate, now)
          )
        )
        .orderBy(tourDates.startDate)
        .limit(CONFIRMED_TOUR_DATE_LIMIT),
      db
        .select(TOUR_DATE_SELECTION)
        .from(tourDates)
        .where(
          and(
            eq(tourDates.profileId, profileId),
            eq(tourDates.confirmationStatus, 'rejected')
          )
        )
        .orderBy(desc(tourDates.startDate))
        .limit(REJECTED_TOUR_DATE_LIMIT),
    ]);

    return {
      pending: pending.map(mapTourDateRowToInboxItem),
      confirmed: confirmed.map(mapTourDateRowToInboxItem),
      rejected: rejected.map(mapTourDateRowToInboxItem),
    };
  } catch (error) {
    logger.error(
      '[opportunity-inbox] tour-date sections load failed; degrading to empty',
      error
    );
    return { pending: [], confirmed: [], rejected: [] };
  }
}

export async function loadOpportunityInboxData(
  clerkUserId: string,
  options?: { readonly profileId?: string | null }
): Promise<OpportunityInboxData | null> {
  const dbUser = await getUserByClerkId(db, clerkUserId);

  if (!dbUser) {
    return null;
  }

  const profileId = options?.profileId ?? null;
  const tourDateSections = profileId
    ? await loadTourDateSections(profileId)
    : undefined;

  try {
    const rows = await db
      .select({
        ...BASE_SELECTION,
        signalType: suggestedActions.signalType,
      })
      .from(suggestedActions)
      .where(pendingForUser(dbUser.id))
      .orderBy(desc(suggestedActions.createdAt))
      .limit(50);

    return buildOpportunityInboxData(rows, tourDateSections);
  } catch (error) {
    if (isMissingConnectorSchemaError(error)) {
      return tourDateSections
        ? buildOpportunityInboxData([], tourDateSections)
        : EMPTY_INBOX_DATA;
    }
    if (isMissingSignalTypeColumnError(error)) {
      // Migration drift: prod DB predates the signal_type column. Degrade to
      // the legacy selection; the mapper classifies at read time instead.
      const rows = await db
        .select(BASE_SELECTION)
        .from(suggestedActions)
        .where(pendingForUser(dbUser.id))
        .orderBy(desc(suggestedActions.createdAt))
        .limit(50);
      return buildOpportunityInboxData(rows, tourDateSections);
    }
    throw error;
  }
}
