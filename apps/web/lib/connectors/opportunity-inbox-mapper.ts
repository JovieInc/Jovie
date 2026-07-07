import { APP_ROUTES } from '@/constants/routes';
import { classifySuggestedActionCategory } from './opportunity-inbox-tour-dates';
import type {
  OpportunityInboxCardCategory,
  OpportunityInboxCardViewModel,
  OpportunityInboxData,
  OpportunityInboxEmptyActionCard,
  OpportunityInboxTourDates,
} from './opportunity-inbox-types';

interface SuggestedActionRow {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly rationale: string | null;
  readonly createdAt: Date;
}

const PRIMARY_ACTION_LABEL_BY_KIND: Readonly<Record<string, string>> = {
  'calendar.create_event': 'Add to calendar',
};

const TYPE_LABEL_BY_KIND: Readonly<Record<string, string>> = {
  'calendar.create_event': 'Suggestion',
};

function typeLabelFor(
  kind: string,
  category: OpportunityInboxCardCategory
): string {
  if (category === 'tour_date') {
    return 'Tour date';
  }
  return TYPE_LABEL_BY_KIND[kind] ?? 'Suggestion';
}

function primaryActionLabelFor(
  kind: string,
  category: OpportunityInboxCardCategory
): string {
  if (category === 'tour_date') {
    return 'Confirm date';
  }
  return PRIMARY_ACTION_LABEL_BY_KIND[kind] ?? 'Approve';
}

function titleFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Untitled suggestion';
  }

  const title = (payload as { title?: unknown }).title;
  return typeof title === 'string' && title.trim().length > 0
    ? title.trim()
    : 'Untitled suggestion';
}

function whyFromRow(row: SuggestedActionRow): string {
  const rationale = row.rationale?.trim();
  if (rationale) {
    return rationale;
  }

  if (row.payload && typeof row.payload === 'object') {
    const payloadRationale = (row.payload as { rationale?: unknown }).rationale;
    if (typeof payloadRationale === 'string' && payloadRationale.trim()) {
      return payloadRationale.trim();
    }
  }

  return 'Jovie found a booking signal worth your review.';
}

export function mapSuggestedActionToInboxCard(
  row: SuggestedActionRow
): OpportunityInboxCardViewModel {
  const category = classifySuggestedActionCategory(row);
  return {
    id: row.id,
    typeLabel: typeLabelFor(row.kind, category),
    createdAt: row.createdAt.toISOString(),
    title: titleFromPayload(row.payload),
    why: whyFromRow(row),
    primaryActionLabel: primaryActionLabelFor(row.kind, category),
    status: 'pending',
    category,
  };
}

export const DEFAULT_OPPORTUNITY_INBOX_EMPTY_ACTION_CARDS: readonly OpportunityInboxEmptyActionCard[] =
  [
    {
      id: 'connect-spotify',
      title: 'Connect Spotify',
      body: 'Link your catalog so Jovie can spot releases, audience spikes, and pitch windows.',
      actionLabel: 'Connect catalog',
      href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    },
    {
      id: 'add-tour-dates',
      title: 'Add tour dates',
      body: 'Keep dates current so booking suggestions stay aligned with your calendar.',
      actionLabel: 'Add dates',
      href: APP_ROUTES.TOUR_DATES,
    },
  ] as const;

export function buildOpportunityInboxData(
  rows: readonly SuggestedActionRow[],
  tourDates?: OpportunityInboxTourDates
): OpportunityInboxData {
  return {
    cards: rows.map(mapSuggestedActionToInboxCard),
    emptyActionCards: DEFAULT_OPPORTUNITY_INBOX_EMPTY_ACTION_CARDS,
    ...(tourDates ? { tourDates } : {}),
  };
}
