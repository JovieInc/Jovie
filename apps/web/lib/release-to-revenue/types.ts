export const RELEASE_TO_REVENUE_WORKFLOW_KIND = 'release_to_revenue' as const;

export type ReleaseToRevenueTriggerSource = 'manual' | 'catalog';

export interface ReleaseToRevenueProviderLink {
  readonly providerId: string;
  readonly url: string;
  readonly label?: string;
}

export interface ReleaseToRevenueReleaseMetadata {
  readonly releaseId?: string;
  readonly title: string;
  readonly artworkUrl: string | null;
  readonly slug?: string;
  readonly smartLinkPath?: string;
  readonly links: readonly ReleaseToRevenueProviderLink[];
}

export interface DesignPartnerStoreConfig {
  readonly provider: 'printful';
  readonly scope: 'default';
}

export interface DesignPartnerSocialAccountConfig {
  readonly platform: 'instagram' | 'tiktok';
  readonly handle: string;
}

export interface DesignPartnerConfigTemplate {
  readonly creatorUsername: string;
  readonly store: DesignPartnerStoreConfig;
  readonly socialAccount: DesignPartnerSocialAccountConfig;
  readonly smsListId: string;
}

export interface ResolvedDesignPartnerConfig
  extends DesignPartnerConfigTemplate {
  readonly creatorProfileId: string;
  readonly userId: string;
}

export type DistributionDraftChannel = 'social_post' | 'sms';

export type DistributionDraftStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'dispatched';

export type DistributionDraftVariant =
  | 'announcement'
  | 'merch_teaser'
  | 'listen_cta'
  | 'sms_blast';

export interface ReleaseDistributionDraft {
  readonly id: string;
  readonly channel: DistributionDraftChannel;
  readonly platform: 'instagram' | 'tiktok' | 'sms';
  readonly variant: DistributionDraftVariant;
  readonly body: string;
  readonly status: DistributionDraftStatus;
  readonly createdAt: string;
  readonly decidedAt?: string;
  readonly dispatchedAt?: string;
}

export interface ReleaseDistributionDrafts {
  readonly releaseLink: string;
  readonly merchDropLink: string | null;
  readonly items: readonly ReleaseDistributionDraft[];
}

export interface ReleaseToRevenueStoreListing {
  /** Merch cards published as the release store listing for this autopilot run. */
  readonly merchCardIds: readonly string[];
}

export interface ReleaseToRevenueRunStepOutputs {
  readonly releaseId: string | null;
  readonly triggerSource: ReleaseToRevenueTriggerSource;
  readonly triggeredAt: string;
  readonly designPartner: ResolvedDesignPartnerConfig;
  readonly release: ReleaseToRevenueReleaseMetadata;
  readonly distributionDrafts?: ReleaseDistributionDrafts;
  readonly storeListing?: ReleaseToRevenueStoreListing;
}

export interface ReleaseGmvPerRunRow {
  readonly workflowRunId: string;
  readonly releaseId: string | null;
  readonly releaseTitle: string;
  readonly triggeredAt: string;
  readonly merchCardIds: readonly string[];
  readonly orderCount: number;
  /** Store GMV in cents (paid Printful-backed order subtotals). */
  readonly gmvCents: number;
}

export interface DesignPartnerReleaseGmvSnapshot {
  readonly creatorUsername: string;
  readonly generatedAtIso: string;
  readonly releases: readonly ReleaseGmvPerRunRow[];
  readonly totalGmvCents: number;
}

export interface ManualReleaseTriggerInput {
  readonly triggerSource: 'manual';
  readonly title: string;
  readonly artworkUrl?: string | null;
  readonly links?: readonly ReleaseToRevenueProviderLink[];
  readonly slug?: string;
}

export interface CatalogReleaseTriggerInput {
  readonly triggerSource: 'catalog';
  readonly releaseId: string;
}

export type NewReleaseTriggerInput =
  | ManualReleaseTriggerInput
  | CatalogReleaseTriggerInput;

export interface CreateReleaseToRevenueRunResult {
  readonly runId: string;
  readonly status: 'created' | 'existing';
}
