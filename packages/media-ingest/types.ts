export type MediaKind = 'photo' | 'video' | 'audio' | 'unknown';

export type MediaSubtype =
  | 'photo'
  | 'screenshot'
  | 'voice-memo'
  | 'live-clip'
  | 'music-video'
  | 'video'
  | 'audio'
  | 'unknown';

export type Origin = 'yours' | 'fan' | 'unknown';

export type EventKind = 'show' | 'session' | 'travel-day' | 'unknown';

export interface Checksum {
  sizeBytes: number;
  sha256: string;
}

export interface CaptureInfo {
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  cameraModel: string | null;
  source: 'exif' | 'mtime' | 'filename';
}

export interface AudioAnalysis {
  durationSec: number | null;
  bpm: number | null;
  key: string | null;
  codec: 'wav-pcm' | 'unsupported';
}

export interface TranscriptResult {
  text: string;
  language: string;
  needsTranslation: boolean;
  engine: string;
}

export interface CatalogSong {
  id: string;
  title: string;
  durationSec: number | null;
}

export interface AssetRecord {
  id: string;
  sourcePath: string;
  libraryPath: string | null;
  checksum: Checksum;
  kind: MediaKind;
  subtype: MediaSubtype;
  origin: Origin;
  originReason: string;
  capture: CaptureInfo;
  eventId: string | null;
  audio: AudioAnalysis | null;
  songId: string | null;
  transcript: TranscriptResult | null;
  needsReview: boolean;
  reviewReasons: string[];
  ingestedAt: string;
}

export interface MediaEvent {
  id: string;
  date: string;
  kind: EventKind;
  latitude: number | null;
  longitude: number | null;
  assetIds: string[];
  confidence: 'high' | 'low';
}

export type InboxStatus = 'pending' | 'kept' | 'skipped';

export interface InboxItem {
  id: string;
  assetId: string;
  status: InboxStatus;
  retouchEligible: boolean;
  contentEligible: boolean;
  decidedAt: string | null;
}

export interface IngestReport {
  ingested: number;
  duplicates: number;
  skipped: number;
  verifyFailed: number;
  needsReview: number;
  events: MediaEvent[];
  transferLogPath: string;
}
