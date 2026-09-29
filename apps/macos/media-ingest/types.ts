export type MediaKind = 'photo' | 'video' | 'audio';

export type MediaSubtype =
  | 'photo'
  | 'screenshot'
  | 'voice-memo'
  | 'live-clip'
  | 'music-video'
  | 'video'
  | 'audio';

export type MediaOrigin = 'yours' | 'fan' | 'unknown';

export type MediaObjectType =
  | 'owned-media'
  | 'presence-claim'
  | 'unclassified-media';

export interface Checksum {
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface IngestSource {
  readonly root: string;
  readonly origin: MediaOrigin;
  readonly label?: string;
}

export interface AssetRecord {
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceLabel: string;
  readonly libraryPath: string;
  readonly checksum: Checksum;
  readonly kind: MediaKind;
  readonly subtype: MediaSubtype;
  readonly origin: MediaOrigin;
  readonly objectType: MediaObjectType;
  readonly fileModifiedAt: string;
  readonly needsReview: boolean;
  readonly reviewReasons: readonly string[];
  readonly ingestedAt: string;
}

export type InboxStatus = 'pending' | 'kept' | 'skipped';

export interface InboxItem {
  readonly id: string;
  readonly assetId: string;
  status: InboxStatus;
  retouchEligible: boolean;
  contentEligible: boolean;
  decidedAt: string | null;
}

export interface IngestReport {
  readonly ingested: number;
  readonly duplicates: number;
  readonly skipped: number;
  readonly verifyFailed: number;
  readonly needsReview: number;
  readonly transferLogPath: string;
}
