import { APP_ROUTES } from '@/constants/routes';
import {
  isReportKind,
  parseReportMeasurement,
} from './opportunity-inbox-report';
import {
  classifyOpportunitySignalType,
  OPPORTUNITY_SIGNAL_TYPE_META,
} from './opportunity-inbox-signal-type';
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
  /** Persisted classification (nullable pre-backfill / pre-migration). */
  readonly signalType?: string | null;
}

const PRIMARY_ACTION_LABEL_BY_KIND: Readonly<Record<string, string>> = {
  'calendar.create_event': 'Add to calendar',
  'authority.create_page': 'Draft page',
};

function primaryActionLabelFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const label = (payload as { primaryActionLabel?: unknown })
    .primaryActionLabel;
  return typeof label === 'string' && label.trim().length > 0
    ? label.trim()
    : null;
}

function primaryActionLabelFor(
  kind: string,
  category: OpportunityInboxCardCategory,
  payload?: unknown
): string {
  if (category === 'tour_date') {
    return 'Confirm date';
  }
  const fromPayload = primaryActionLabelFromPayload(payload);
  if (fromPayload) return fromPayload;
  return PRIMARY_ACTION_LABEL_BY_KIND[kind] ?? 'Approve';
}

function titleFromPayload(payload: unknown, category?: string): string {
  const fallback =
    category === 'report' ? 'Experiment result' : 'Untitled suggestion';
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const title = (payload as { title?: unknown }).title;
  return typeof title === 'string' && title.trim().length > 0
    ? title.trim()
    : fallback;
}

function whyFromRow(row: SuggestedActionRow, category?: string): string {
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

  if (category === 'report') {
    return 'Jovie measured the results of your experiment.';
  }
  return 'Jovie found a booking signal worth your review.';
}

export function mapSuggestedActionToInboxCard(
  row: SuggestedActionRow
): OpportunityInboxCardViewModel {
  // Malformed measurement payloads degrade to the plain suggestion card
  // (report data null) rather than crashing the feed.
  const report = isReportKind(row.kind)
    ? parseReportMeasurement(row.payload)
    : null;
  const signalType = classifyOpportunitySignalType(row);
  const category: OpportunityInboxCardCategory = report
    ? 'report'
    : classifySuggestedActionCategory(row);
  return {
    id: row.id,
    signalType,
    // Report cards keep a fixed type label; all other cards use the typed
    // signal-category label (song / event / profile match / suggestion).
    typeLabel:
      category === 'report'
        ? 'Report'
        : OPPORTUNITY_SIGNAL_TYPE_META[signalType].label,
    createdAt: row.createdAt.toISOString(),
    title: titleFromPayload(row.payload, category),
    why: whyFromRow(row, category),
    primaryActionLabel:
      report?.nextStep?.label ??
      primaryActionLabelFor(row.kind, category, row.payload),
    status: 'pending',
    category,
    ...(report ? { report } : {}),
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
  const cards = rows.map(mapSuggestedActionToInboxCard);
  // Report-back cards surface at the top of the inbox (GH #13178) so the
  // measurement loop visibly closes; relative order is otherwise preserved.
  const reportCards = cards.filter(card => card.category === 'report');
  const otherCards = cards.filter(card => card.category !== 'report');
  return {
    cards: [...reportCards, ...otherCards],
    emptyActionCards: DEFAULT_OPPORTUNITY_INBOX_EMPTY_ACTION_CARDS,
    ...(tourDates ? { tourDates } : {}),
  };
}
