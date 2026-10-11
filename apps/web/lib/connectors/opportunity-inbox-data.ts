import 'server-only';

import { and, desc, eq, gte, inArray, type SQL } from 'drizzle-orm';
import {
  isMissingConnectorSchemaError,
  isMissingSignalTypeColumnError,
} from '@/lib/connectors/schema-errors';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { feedbackItems } from '@/lib/db/schema/feedback';
import { tourDates } from '@/lib/db/schema/tour';
import { logger } from '@/lib/utils/logger';
import { isCreatorInboxSourceKind } from './creator-inbox-source-policy';
import { creatorInboxSourceCondition } from './creator-inbox-source-policy.server';
import { buildOpportunityInboxData } from './opportunity-inbox-mapper';
import { mapTourDateRowToInboxItem } from './opportunity-inbox-tour-dates';
import type {
  OpportunityInboxData,
  OpportunityInboxTourDates,
} from './opportunity-inbox-types';
import {
  learnSocialInboxRankingPreferences,
  parseSocialInboxFeedbackSample,
} from './social-inbox-ranker';

import { SOCIAL_REPLY_DRAFT_KIND } from './suggested-action-kinds';

const PENDING_TOUR_DATE_LIMIT = 20;
const CONFIRMED_TOUR_DATE_LIMIT = 10;
const REJECTED_TOUR_DATE_LIMIT = 20;
const SOCIAL_INBOX_CANDIDATE_LIMIT = 200;
const SOCIAL_INBOX_FEEDBACK_LIMIT = 500;

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
  executionResult: suggestedActions.executionResult,
  createdAt: suggestedActions.createdAt,
} as const;

function pendingForUser(userId: string): SQL | undefined {
  return and(
    eq(suggestedActions.userId, userId),
    eq(suggestedActions.status, 'pending'),
    // Workflow recordings belong to Ovie, including for founders using Jovie.
    creatorInboxSourceCondition(suggestedActions.kind)
  );
}

async function loadSocialInboxRankingPreferences(userId: string) {
  try {
    const rows = await db
      .select({ context: feedbackItems.context })
      .from(feedbackItems)
      .where(
        and(
          eq(feedbackItems.userId, userId),
          inArray(feedbackItems.source, [
            'opportunity-inbox',
            'opportunity-inbox-decision',
          ])
        )
      )
      .orderBy(desc(feedbackItems.createdAt))
      .limit(SOCIAL_INBOX_FEEDBACK_LIMIT);
    return learnSocialInboxRankingPreferences(
      rows.flatMap(row => {
        const sample = parseSocialInboxFeedbackSample(row.context);
        return sample ? [sample] : [];
      })
    );
  } catch (error) {
    logger.error(
      '[opportunity-inbox] social ranking feedback unavailable; using v0 weights',
      error
    );
    return learnSocialInboxRankingPreferences([]);
  }
}

async function buildRankedOpportunityInbox(
  rows: Parameters<typeof buildOpportunityInboxData>[0],
  userId: string,
  tourDateSections?: OpportunityInboxTourDates
) {
  const preferences = rows.some(row => row.kind === SOCIAL_REPLY_DRAFT_KIND)
    ? await loadSocialInboxRankingPreferences(userId)
    : undefined;
  return buildOpportunityInboxData(
    rows.filter(row => isCreatorInboxSourceKind(row.kind)),
    tourDateSections,
    { preferences }
  );
}

/**
 * Detected tour-date signals awaiting the creator's confirm/reject call, plus
 * the visible confirmed list and the hidden rejected bucket.
 *
 * Fail-soft: any query error degrades to empty sections so the inbox feed
 * still renders (same posture as the suggested-actions migration-drift guard).
 */
export async function loadOpportunityInboxTourDateSections(
  profileId: string
): Promise<OpportunityInboxTourDates> {
  try {
    const now = new Date();

    const [pending, confirmed, rejected] = await Promise.allSettled([
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

    const sections = [pending, confirmed, rejected];
    for (const section of sections) {
      if (section.status === 'rejected') {
        logger.error(
          '[opportunity-inbox] tour-date section unavailable',
          section.reason
        );
      }
    }
    return {
      availability: sections.every(section => section.status === 'fulfilled')
        ? 'available'
        : 'unknown',
      pending:
        pending.status === 'fulfilled'
          ? pending.value.map(mapTourDateRowToInboxItem)
          : [],
      confirmed:
        confirmed.status === 'fulfilled'
          ? confirmed.value.map(mapTourDateRowToInboxItem)
          : [],
      rejected:
        rejected.status === 'fulfilled'
          ? rejected.value.map(mapTourDateRowToInboxItem)
          : [],
    };
  } catch (error) {
    logger.error(
      '[opportunity-inbox] tour-date sections load failed; degrading to empty',
      error
    );
    return {
      availability: 'unknown',
      pending: [],
      confirmed: [],
      rejected: [],
    };
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
    ? await loadOpportunityInboxTourDateSections(profileId)
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
      .limit(SOCIAL_INBOX_CANDIDATE_LIMIT);

    return buildRankedOpportunityInbox(rows, dbUser.id, tourDateSections);
  } catch (error) {
    if (isMissingConnectorSchemaError(error)) {
      const inbox = buildOpportunityInboxData([], tourDateSections);
      return {
        ...inbox,
        availability: {
          suggestedActions: 'unknown',
          tourDates: inbox.availability?.tourDates ?? 'unknown',
        },
      };
    }
    if (isMissingSignalTypeColumnError(error)) {
      // Migration drift: prod DB predates the signal_type column. Degrade to
      // the legacy selection; the mapper classifies at read time instead.
      const rows = await db
        .select(BASE_SELECTION)
        .from(suggestedActions)
        .where(pendingForUser(dbUser.id))
        .orderBy(desc(suggestedActions.createdAt))
        .limit(SOCIAL_INBOX_CANDIDATE_LIMIT);
      return buildRankedOpportunityInbox(rows, dbUser.id, tourDateSections);
    }
    throw error;
  }
}
