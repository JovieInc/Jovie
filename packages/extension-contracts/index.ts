export type ExtensionPageKind =
  | 'unsupported'
  | 'artist'
  | 'release'
  | 'lyrics'
  | 'tour'
  | 'email'
  | 'discovery';

export type ExtensionEntityKind = 'profile' | 'release' | 'tourDate';

export type ExtensionPrimaryActionKind = 'insert' | 'copy' | 'sync' | 'open';

export type ExtensionCapabilityMode = 'off' | 'read' | 'write';

export interface ExtensionContextSummary {
  readonly pageKind: ExtensionPageKind;
  readonly host: string;
  readonly url: string;
  readonly title: string | null;
  readonly statusLabel: string;
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
}

export interface ExtensionFlagsResponse {
  readonly signedIn: boolean;
  readonly chatPromptEnabled: boolean;
  readonly domains: readonly ExtensionDomainFlag[];
}

export interface ExtensionActionLogRequest {
  readonly action: ExtensionPrimaryActionKind;
  readonly entityId: string;
  readonly entityKind: ExtensionEntityKind;
  readonly fieldId?: string;
  readonly pageUrl: string;
  readonly pageTitle?: string | null;
  readonly result: 'pending' | 'succeeded' | 'failed';
}

export interface ExtensionActionLogResponse {
  readonly ok: true;
  readonly actionId: string;
}
