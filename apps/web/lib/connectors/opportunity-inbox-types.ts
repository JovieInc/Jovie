export type OpportunityInboxCardStatus = 'pending';

export interface OpportunityInboxCardViewModel {
  readonly id: string;
  readonly typeLabel: string;
  readonly createdAt: string;
  readonly title: string;
  readonly why: string;
  readonly primaryActionLabel: string;
  readonly status: OpportunityInboxCardStatus;
}

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
}
