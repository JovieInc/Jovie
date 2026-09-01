import type { OpportunitySignalType } from './opportunity-inbox-signal-type';

export type OpportunityInboxCardStatus = 'pending';

export type OpportunityInboxCardCategory =
  | 'suggestion'
  | 'tour_date'
  | 'report'
  | 'brand_deal'
  | 'workflow_capture'
  | 'youtube_thumbnail';

export interface OpportunityInboxYoutubeThumbnailData {
  readonly channelId: string;
  readonly youtubeVideoId: string;
  readonly currentThumbnailUrl: string | null;
  readonly candidateImageUrl: string;
  readonly artifactSha256: string;
  readonly apiMetrics: {
    readonly capturedAt: string;
    readonly views: number | null;
    readonly watchTimeMinutes: number | null;
    readonly avgViewDurationSeconds: number | null;
  };
  readonly publicationBlockedReason: string;
}

export interface OpportunityInboxWorkflowCaptureData {
  readonly instructions: string;
  readonly startUrl: string | null;
  readonly expiresAt: string;
  readonly state: 'pending' | 'uploaded_needs_review';
}

export interface OpportunityInboxReportBreakdownItem {
  readonly label: string;
  readonly deltaPercent?: number;
  readonly detail?: string;
}

export interface OpportunityInboxReportNextStep {
  readonly label: string;
  readonly kind: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly rationale?: string;
}

/** Measurement result rendered by the report card variant (GH #13178). */
export interface OpportunityInboxReportData {
  readonly metricLabel: string;
  readonly deltaPercent: number;
  readonly deltaDisplay: string;
  readonly direction: 'up' | 'down' | 'flat';
  readonly series: readonly number[];
  readonly items: readonly OpportunityInboxReportBreakdownItem[];
  readonly experimentId: string | null;
  readonly nextStep: OpportunityInboxReportNextStep | null;
}

export interface OpportunityInboxCardViewModel {
  readonly id: string;
  readonly signalType: OpportunitySignalType;
  readonly typeLabel: string;
  readonly createdAt: string;
  readonly title: string;
  readonly why: string;
  readonly primaryActionLabel: string;
  readonly status: OpportunityInboxCardStatus;
  readonly category: OpportunityInboxCardCategory;
  /** Server-computed score used to rank verified brand-deal decisions. */
  readonly brandDealRankingScore?: number;
  /** Present only when category === 'report'. */
  readonly report?: OpportunityInboxReportData;
  /** Present only when category === 'workflow_capture'. */
  readonly workflowCapture?: OpportunityInboxWorkflowCaptureData;
  /** Present only when category === 'youtube_thumbnail'. */
  readonly youtubeThumbnail?: OpportunityInboxYoutubeThumbnailData;
}

export interface OpportunityInboxTourDateItem {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly startTime: string | null;
  readonly venueName: string;
  readonly location: string;
  readonly providerLabel: string;
  readonly status: 'pending' | 'confirmed' | 'rejected';
}

export interface OpportunityInboxTourDates {
  readonly pending: readonly OpportunityInboxTourDateItem[];
  readonly confirmed: readonly OpportunityInboxTourDateItem[];
  readonly rejected: readonly OpportunityInboxTourDateItem[];
}

export const EMPTY_OPPORTUNITY_INBOX_TOUR_DATES: OpportunityInboxTourDates = {
  pending: [],
  confirmed: [],
  rejected: [],
};

export interface OpportunityInboxEmptyActionCard {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly actionLabel: string;
  readonly href: string;
}

export interface OpportunityInboxData {
  readonly cards: readonly OpportunityInboxCardViewModel[];
  readonly emptyActionCards: readonly OpportunityInboxEmptyActionCard[];
  readonly tourDates?: OpportunityInboxTourDates;
}
