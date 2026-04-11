export type ExtensionPageKind =
  | 'unsupported'
  | 'artist'
  | 'release'
  | 'lyrics'
  | 'tour'
  | 'email'
  | 'discovery';

export type ExtensionEntityKind = 'profile' | 'release' | 'tourDate';

export type ExtensionWorkflowId =
  | 'distrokid_release_form'
  | 'awal_release_form'
  | 'kosign_work_form';

export type ExtensionPrimaryActionKind =
  | 'insert'
  | 'copy'
  | 'sync'
  | 'open'
  | 'preview';

export type ExtensionActionOperation = 'preview' | 'apply' | 'undo' | 'open';

export type ExtensionCapabilityMode = 'off' | 'read' | 'write';

export type ExtensionWorkflowStatus = 'ready' | 'blocked' | 'fallback';

export type ExtensionFieldMappingStatus = 'ready' | 'blocked' | 'unsupported';

export type ExtensionFieldMappingConfidence =
  | 'exact'
  | 'derived'
  | 'unsupported';

export type ExtensionTargetKey =
  | 'release_title'
  | 'artist_name'
  | 'release_date'
  | 'upc'
  | 'primary_genre'
  | 'secondary_genre'
  | 'label_name'
  | 'track_title'
  | 'track_isrc'
  | 'explicit'
  | 'songwriter'
  | 'producer'
  | 'youtube_music_id';

export interface ExtensionContextSummary {
  readonly pageKind: ExtensionPageKind;
  readonly host: string;
  readonly url: string;
  readonly title: string | null;
  readonly statusLabel: string;
  readonly workflowId?: ExtensionWorkflowId | null;
  readonly pageVariant?: string | null;
}

export interface ExtensionEntityField {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly actions: readonly ExtensionPrimaryActionKind[];
}

export interface ExtensionPrimaryAction {
  readonly kind: ExtensionPrimaryActionKind;
  readonly label: string;
  readonly workflowId?: ExtensionWorkflowId | null;
}

export interface ExtensionEntitySummary {
  readonly id: string;
  readonly kind: ExtensionEntityKind;
  readonly title: string;
  readonly subtitle: string | null;
  readonly imageUrl: string | null;
  readonly metadataLine: string | null;
  readonly primaryAction: ExtensionPrimaryAction;
  readonly fields: readonly ExtensionEntityField[];
}

export interface ExtensionDiscoverySuggestion {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly actionLabel: string;
}

export interface ExtensionShellCopy {
  readonly title: string;
  readonly body: string;
}

export interface ExtensionSummaryResponse {
  readonly status: 'ready' | 'signed_out' | 'no_match' | 'unsupported';
  readonly context: ExtensionContextSummary;
  readonly shellCopy: ExtensionShellCopy;
  readonly suggestion: ExtensionEntitySummary | null;
  readonly entities: readonly ExtensionEntitySummary[];
  readonly discoverySuggestions: readonly ExtensionDiscoverySuggestion[];
}

export interface ExtensionDomainFlag {
  readonly host: string;
  readonly label: string;
  readonly mode: ExtensionCapabilityMode;
  readonly workflowId?: ExtensionWorkflowId | null;
}

export interface ExtensionFlagsResponse {
  readonly signedIn: boolean;
  readonly chatPromptEnabled: boolean;
  readonly domains: readonly ExtensionDomainFlag[];
}

export interface ExtensionSessionProfileSummary {
  readonly id: string;
  readonly displayName: string;
  readonly username: string | null;
  readonly avatarUrl: string | null;
}

export interface ExtensionSessionStatusResponse {
  readonly signedIn: boolean;
  readonly profile: ExtensionSessionProfileSummary | null;
}

export interface ExtensionAvailableTarget {
  readonly targetId: string;
  readonly targetKey: ExtensionTargetKey;
  readonly targetLabel: string;
  readonly currentValue: string | null;
  readonly groupIndex?: number;
}

export interface ExtensionFillPreviewRequest {
  readonly workflowId: ExtensionWorkflowId;
  readonly entityId: string;
  readonly entityKind: Extract<ExtensionEntityKind, 'release'>;
  readonly pageUrl: string;
  readonly pageTitle?: string | null;
  readonly pageVariant: string | null;
  readonly availableTargets: readonly ExtensionAvailableTarget[];
}

export interface ExtensionFieldMapping {
  readonly targetId: string;
  readonly targetKey: ExtensionTargetKey;
  readonly targetLabel: string;
  readonly groupIndex?: number;
  readonly sourceKey: string;
  readonly value: string;
  readonly required: boolean;
  readonly confidence: ExtensionFieldMappingConfidence;
  readonly status: ExtensionFieldMappingStatus;
  readonly reason?: string;
}

export interface ExtensionBlocker {
  readonly code: string;
  readonly label: string;
  readonly message: string;
  readonly fixUrl: string;
}

export interface ExtensionSubmissionPacketLine {
  readonly label: string;
  readonly value: string;
}

export interface ExtensionSubmissionPacketSection {
  readonly id: string;
  readonly title: string;
  readonly lines: readonly ExtensionSubmissionPacketLine[];
}

export interface ExtensionSubmissionPacket {
  readonly title: string;
  readonly summary: string;
  readonly sections: readonly ExtensionSubmissionPacketSection[];
}

export interface ExtensionFillPreviewResponse {
  readonly status: ExtensionWorkflowStatus;
  readonly workflowId: ExtensionWorkflowId;
  readonly entityId: string;
  readonly entityTitle: string;
  readonly mappings: readonly ExtensionFieldMapping[];
  readonly blockers: readonly ExtensionBlocker[];
  readonly unsupportedTargets: readonly ExtensionAvailableTarget[];
  readonly submissionPacket: ExtensionSubmissionPacket;
}

export interface ExtensionActionLogRequest {
  readonly action?: ExtensionPrimaryActionKind;
  readonly workflowId?: ExtensionWorkflowId;
  readonly operation?: ExtensionActionOperation;
  readonly entityId: string;
  readonly entityKind: ExtensionEntityKind;
  readonly fieldId?: string;
  readonly pageUrl: string;
  readonly pageTitle?: string | null;
  readonly result: 'pending' | 'succeeded' | 'failed';
  readonly appliedCount?: number;
  readonly failedTargets?: readonly string[];
}

export interface ExtensionActionLogResponse {
  readonly ok: true;
  readonly actionId: string;
}

export interface ExtensionUndoFieldSnapshot {
  readonly targetId: string;
  readonly targetKey: ExtensionTargetKey;
  readonly targetLabel: string;
  readonly groupIndex?: number;
  readonly previousValue: string | null;
  readonly nextValue: string;
}

export interface ExtensionUndoSnapshot {
  readonly applyAttemptId: string;
  readonly workflowId: ExtensionWorkflowId;
  readonly pageUrl: string;
  readonly createdAt: string;
  readonly fields: readonly ExtensionUndoFieldSnapshot[];
}

export interface ExtensionApplyResult {
  readonly applyAttemptId: string;
  readonly appliedCount: number;
  readonly failedTargets: readonly string[];
  readonly undoSnapshot: ExtensionUndoSnapshot;
}
