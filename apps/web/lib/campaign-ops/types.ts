/**
 * Campaign ops domain types — production contracts behind the founder demo loop
 * (external opportunity → segment → recommendation → drop → approval → monitor).
 *
 * Pure data contracts; no DB/IO. Consumers (chat, inbox, orchestrators) map these
 * into durable storage and UI view models.
 */

export type SignalSourceKind =
  | 'event_festival'
  | 'commerce_window'
  | 'collaborator';

export type OpportunityKind =
  | 'festival_attention'
  | 'commerce_window'
  | 'collaborator_moment';

export type CampaignChannel =
  | 'jovie_link'
  | 'email'
  | 'sms'
  | 'profile'
  | 'social';

export type DropLifecycleState =
  | 'draft'
  | 'preview_ready'
  | 'scheduled'
  | 'live'
  | 'ended'
  | 'cancelled';

export type ApprovalStepId =
  | 'create_campaign'
  | 'create_drop'
  | 'update_smart_link'
  | 'draft_notifications'
  | 'select_audience'
  | 'create_tasks'
  | 'schedule_launch'
  | 'enable_monitoring';

export type ApprovalStepStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped';

export type CampaignHealthStatus = 'healthy' | 'watch' | 'at_risk' | 'paused';

export type NextMoveKind =
  | 'boost_channel'
  | 'extend_window'
  | 'retarget_segment'
  | 'follow_up_content'
  | 'close_and_report';

export interface ExternalSignalInput {
  readonly sourceKind: SignalSourceKind;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  readonly artistId: string;
  readonly artistName: string;
  readonly collaboratorId?: string;
  readonly collaboratorName?: string;
  readonly eventName?: string;
  readonly venue?: string;
  readonly city?: string;
  readonly startsAt: string; // ISO
  readonly endsAt?: string; // ISO
  readonly observedAt: string; // ISO
  readonly confidence: number; // 0..1
  readonly expiryAt: string; // ISO
  readonly tags?: readonly string[];
}

export interface NormalizedExternalSignal {
  readonly id: string;
  readonly dedupeKey: string;
  readonly sourceKind: SignalSourceKind;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  readonly artistId: string;
  readonly artistName: string;
  readonly collaboratorId: string | null;
  readonly collaboratorName: string | null;
  readonly eventName: string | null;
  readonly venue: string | null;
  readonly city: string | null;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly observedAt: string;
  readonly confidence: number;
  readonly expiryAt: string;
  readonly tags: readonly string[];
}

export interface ArtistOpportunity {
  readonly id: string;
  readonly kind: OpportunityKind;
  readonly artistId: string;
  readonly title: string;
  readonly why: string;
  readonly rankScore: number;
  readonly confidence: number;
  readonly windowStartsAt: string;
  readonly windowEndsAt: string;
  readonly signalIds: readonly string[];
  readonly collaboratorId: string | null;
  readonly collaboratorName: string | null;
  readonly sourceUrls: readonly string[];
}

export type SegmentDimension =
  | 'genre_affinity'
  | 'link_activity'
  | 'buyer'
  | 'subscriber'
  | 'recency';

export interface FanActivityRecord {
  readonly memberId: string;
  readonly eventType: string;
  readonly genreTags?: readonly string[];
  readonly isBuyer?: boolean;
  readonly isSubscriber?: boolean;
  readonly lastActiveAt: string; // ISO
  readonly linkClickCount?: number;
}

export interface SegmentDefinition {
  readonly id: string;
  readonly name: string;
  readonly dimensions: readonly SegmentDimension[];
  /** Genre tags any of which qualify (OR within set). Empty = any genre. */
  readonly genreTags?: readonly string[];
  /** Max days since last activity. */
  readonly recencyDays?: number;
  readonly requireBuyer?: boolean;
  readonly requireSubscriber?: boolean;
  readonly minLinkClicks?: number;
}

export interface SegmentMemberSample {
  readonly memberId: string;
  readonly matchedDimensions: readonly SegmentDimension[];
}

export interface SegmentPreview {
  readonly definitionId: string;
  readonly size: number;
  readonly sampleMembers: readonly SegmentMemberSample[];
  readonly missingDataNotes: readonly string[];
  readonly refreshedAt: string;
}

export interface ProductAssumption {
  readonly sku: string;
  readonly label: string;
  readonly unitPriceCents: number;
  readonly expectedConversionRate: number; // 0..1 of segment
  readonly cogsCents?: number;
}

export interface CampaignRecommendationInput {
  readonly opportunity: ArtistOpportunity;
  readonly segmentSize: number;
  readonly segmentName: string;
  readonly products: readonly ProductAssumption[];
  readonly channels: readonly CampaignChannel[];
  readonly windowHours: number;
  readonly now?: string;
}

export interface CampaignOption {
  readonly id: string;
  readonly title: string;
  readonly whyNow: string;
  readonly targetAudience: string;
  readonly channels: readonly CampaignChannel[];
  readonly productSku: string;
  readonly productLabel: string;
  readonly unitPriceCents: number;
  readonly expectedOrders: number;
  readonly expectedRevenueCents: number;
  readonly expectedMarginCents: number | null;
  readonly assumptions: readonly string[];
  readonly confidence: number;
  readonly rankScore: number;
}

export interface CampaignRecommendationResult {
  readonly opportunityId: string;
  readonly options: readonly CampaignOption[];
  readonly generatedAt: string;
}

export interface DropRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly ownerProfileId: string;
  readonly productSku: string;
  readonly productLabel: string;
  readonly priceCents: number;
  readonly inventoryMode: 'unlimited' | 'limited';
  readonly inventoryCount: number | null;
  readonly fulfillment: 'print_on_demand' | 'manual' | 'digital';
  readonly artworkAssetId: string | null;
  readonly launchStartsAt: string;
  readonly launchEndsAt: string;
  readonly state: DropLifecycleState;
  readonly productPageKey: string;
  readonly previewUrl: string | null;
}

export interface DropTransitionResult {
  readonly drop: DropRecord;
  readonly previousState: DropLifecycleState;
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface ApprovalStepRecord {
  readonly id: ApprovalStepId;
  readonly status: ApprovalStepStatus;
  readonly attempt: number;
  readonly output: Readonly<Record<string, unknown>> | null;
  readonly error: string | null;
  readonly updatedAt: string;
}

export interface ApprovalWorkflowState {
  readonly workflowId: string;
  readonly recommendationId: string;
  readonly artistId: string;
  readonly idempotencyKey: string;
  readonly steps: readonly ApprovalStepRecord[];
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CampaignEventCounters {
  readonly clicks: number;
  readonly purchases: number;
  readonly replies: number;
  readonly optIns: number;
  readonly channelStatuses: Readonly<
    Record<CampaignChannel, 'ok' | 'degraded' | 'off'>
  >;
}

export interface CampaignHealthSnapshot {
  readonly campaignId: string;
  readonly status: CampaignHealthStatus;
  readonly counters: CampaignEventCounters;
  readonly conversionRate: number;
  readonly capturedAt: string;
  readonly paused: boolean;
}

export interface NextMoveRecommendation {
  readonly id: string;
  readonly kind: NextMoveKind;
  readonly title: string;
  readonly evidence: readonly string[];
  readonly expectedImpact: string;
  readonly confidence: number;
}

export interface ReleaseWorkflowTask {
  readonly dedupeKey: string;
  readonly title: string;
  readonly category: string;
  readonly dueDaysOffset: number;
  readonly assigneeType: 'human' | 'ai_workflow';
  readonly state: 'pending' | 'in_progress' | 'done' | 'skipped';
}

export interface ReleasePlaybookTemplate {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly tasks: readonly Omit<ReleaseWorkflowTask, 'dedupeKey' | 'state'>[];
}

export interface ReleaseWorkflowInstance {
  readonly id: string;
  readonly releaseId: string;
  readonly playbookId: string;
  readonly playbookVersion: string;
  readonly tasks: readonly ReleaseWorkflowTask[];
  readonly createdAt: string;
}
