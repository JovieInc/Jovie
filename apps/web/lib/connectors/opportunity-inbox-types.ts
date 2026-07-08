export type OpportunityInboxCardStatus = 'pending';

export type OpportunityInboxCardCategory = 'suggestion' | 'tour_date';

export interface OpportunityInboxCardViewModel {
  readonly id: string;
  readonly typeLabel: string;
  readonly createdAt: string;
  readonly title: string;
  readonly why: string;
  readonly primaryActionLabel: string;
  readonly status: OpportunityInboxCardStatus;
  readonly category: OpportunityInboxCardCategory;
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
