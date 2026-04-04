import type { MetadataSubmissionRequest } from '@/lib/db/schema/metadata-submissions';

export type SubmissionProviderTransport =
  | 'email'
  | 'oauth_api'
  | 'authenticated_edit';

export type SubmissionInputKey =
  | 'artist_bio'
  | 'artist_name'
  | 'artist_contact_email'
  | 'release'
  | 'release_tracks'
  | 'release_artwork'
  | 'press_photos';

export interface SubmissionAttachment {
  kind: string;
  filename: string;
  mimeType: string;
  contentBase64?: string;
  blobUrl?: string | null;
  checksum: string;
}

export interface SubmissionPackage {
  subject: string;
  text: string;
  html: string;
  attachments: SubmissionAttachment[];
  monitoringBaseline: SubmissionMonitoringBaseline;
}

export interface SubmissionMissingField {
  field: string;
  reason: string;
}

export interface SubmissionSendResult {
  status: 'sent' | 'failed' | 'unsupported';
  providerMessageId?: string;
  error?: string;
}

export interface DiscoveredTarget {
  targetType: string;
  canonicalUrl: string;
  externalId?: string | null;
}

export interface SubmissionIssueDraft {
  field: string;
  issueType: 'mismatch' | 'review_required' | 'missing';
  severity: 'low' | 'medium' | 'high';
  expectedValue?: string | null;
  observedValue?: string | null;
}

export interface ProviderSnapshot {
  targetType: string;
  canonicalUrl: string;
  normalizedData: SubmissionMonitoringBaseline;
}

export interface SubmissionMonitoringBaseline {
  artistName?: string | null;
  releaseTitle?: string | null;
  releaseDate?: string | null;
  upc?: string | null;
  trackCount?: number | null;
  hasCredits?: boolean;
  hasBio?: boolean;
  hasArtistImage?: boolean;
  hasArtwork?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}

export interface SubmissionTrack {
  title: string;
  trackNumber: number;
  discNumber: number;
  performer: string;
  composers: string[];
  durationMs: number | null;
  credits: string[];
}

export interface SubmissionImageAsset {
  kind: 'release_artwork' | 'press_photo';
  filename: string;
  mimeType: string;
  url: string;
}

export interface CanonicalSubmissionContext {
  profileId: string;
  artistName: string;
  artistBio: string | null;
  artistContactEmail: string | null;
  replyToEmail: string | null;
  release: {
    id: string;
    title: string;
    releaseType: string;
    releaseDate: Date | null;
    label: string | null;
    upc: string | null;
    totalTracks: number;
    artworkUrl: string | null;
    genres: string[];
    catalogNumber: string | null;
  } | null;
  tracks: SubmissionTrack[];
  pressPhotos: SubmissionImageAsset[];
}

export interface BuildContext {
  canonical: CanonicalSubmissionContext;
  requestId?: string;
}

export interface SendContext {
  request: MetadataSubmissionRequest;
  package: SubmissionPackage;
  canonical: CanonicalSubmissionContext;
}

export interface MonitorContext {
  request: MetadataSubmissionRequest;
  canonical: CanonicalSubmissionContext;
  targets: DiscoveredTarget[];
}

export interface SubmissionProvider {
  id: string;
  displayName: string;
  transport: SubmissionProviderTransport;
  requiredInputs: SubmissionInputKey[];
  buildPackage(ctx: BuildContext): Promise<{
    package: SubmissionPackage | null;
    missingFields: SubmissionMissingField[];
  }>;
  send?(ctx: SendContext): Promise<SubmissionSendResult>;
  discoverTargets?(ctx: MonitorContext): Promise<DiscoveredTarget[]>;
  snapshot?(ctx: {
    canonical: CanonicalSubmissionContext;
    target: DiscoveredTarget;
  }): Promise<ProviderSnapshot | null>;
  diff?(
    baseline: SubmissionMonitoringBaseline,
    live: SubmissionMonitoringBaseline
  ): SubmissionIssueDraft[];
}
