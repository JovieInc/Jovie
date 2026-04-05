/** Client-safe catalog mismatch type (matches API response shape) */
export interface CatalogMismatch {
  id: string;
  scanId: string;
  creatorProfileId: string;
  isrc: string;
  mismatchType: 'not_in_catalog' | 'missing_from_dsp';
  externalTrackId: string | null;
  externalTrackName: string | null;
  externalAlbumName: string | null;
  externalAlbumId: string | null;
  externalArtworkUrl: string | null;
  externalArtistNames: string | null;
  status: 'flagged' | 'confirmed_mismatch' | 'dismissed';
  dismissedAt: string | null;
  dismissedReason: string | null;
  dedupKey: string;
  createdAt: string;
  updatedAt: string;
}

/** Client-safe catalog scan type (matches API response shape) */
export interface CatalogScan {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  matchedCount: number;
  catalogIsrcCount: number;
  coveragePct: string | null;
  albumsScanned: number;
  tracksScanned: number;
  error: string | null;
  completedAt: string | null;
}
