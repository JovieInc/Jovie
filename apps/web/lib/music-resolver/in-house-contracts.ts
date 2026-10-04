export const PROVENANCE_CONFIDENCE = {
  input_url: 0.95,
  isrc_exact: 0.92,
  upc_exact: 0.92,
  musicbrainz_url_rel: 0.8,
  exact_name: 0.72,
} as const;

export interface ResolvedDspLink {
  readonly provider: string;
  readonly url: string;
  readonly provenance: string;
  readonly confidence: number;
}

export interface ResolutionCandidate {
  readonly title: string;
  readonly artist: string | null;
  readonly url: string;
}

export type InHouseEntityKind = 'track' | 'album' | 'artist';

export const RESOLUTION_SOURCE_ERROR_CODES = [
  'UPSTREAM_FAILURE',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'TIMEOUT',
  'INVALID_RESPONSE',
  'UNSUPPORTED',
] as const;

/** Aggregate enrichment sources; provider-specific outcomes remain separate work. */
export interface ResolutionSourceError {
  readonly source: 'catalog_isrc' | 'musicbrainz_isrc';
  readonly code: (typeof RESOLUTION_SOURCE_ERROR_CODES)[number];
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
}

export interface InHouseResolution {
  readonly status: 'resolved' | 'no_match' | 'ambiguous' | 'upstream_error';
  readonly kind: InHouseEntityKind;
  readonly title: string | null;
  readonly artist: string | null;
  readonly isrc: string | null;
  readonly upc: string | null;
  readonly mbid: string | null;
  readonly links: readonly ResolvedDspLink[];
  readonly candidates: readonly ResolutionCandidate[];
  readonly confidence: number;
  readonly provenance: Readonly<Record<string, string>>;
  readonly candidateCount: number;
  readonly artistMetadata?: ResolvedArtistMetadata;
  readonly sourceErrors?: readonly ResolutionSourceError[];
}

/** Core MusicBrainz facts; tags, ratings, images and biographies are excluded. */
export interface ResolvedArtistMetadata {
  readonly source: 'musicbrainz';
  readonly sourceUrl: string;
  readonly disambiguation: string | null;
  readonly aliases: readonly string[];
  readonly type: string | null;
  readonly country: string | null;
  readonly area: string | null;
  readonly origin: string | null;
  readonly isnis: readonly string[];
  readonly ipis: readonly string[];
  readonly wikidataIds: readonly string[];
  readonly externalLinks: readonly {
    readonly provider: string | null;
    readonly url: string;
    readonly relationship: string;
    readonly provenance: 'musicbrainz_url_rel';
  }[];
  readonly releaseGroups: readonly {
    readonly mbid: string;
    readonly title: string;
    readonly primaryType: string | null;
    readonly firstReleaseDate: string | null;
  }[];
  /** Embedded MusicBrainz collections are capped at 25; a full browse may be needed. */
  readonly releaseGroupsComplete: boolean;
}

export type InHouseQuery =
  | {
      readonly kind: 'track';
      readonly isrc: string;
      readonly territory?: string;
    }
  | {
      readonly kind: 'track';
      readonly url: string;
      readonly territory?: string;
    }
  | {
      readonly kind: 'track';
      readonly artist: string;
      readonly title: string;
      readonly territory?: string;
    }
  | {
      readonly kind: 'album';
      readonly upc: string;
      readonly territory?: string;
    }
  | {
      readonly kind: 'album';
      readonly url: string;
      readonly territory?: string;
    }
  | {
      readonly kind: 'album';
      readonly artist: string;
      readonly title: string;
      readonly territory?: string;
    }
  | { readonly kind: 'artist'; readonly name: string }
  | { readonly kind: 'artist'; readonly url: string }
  | { readonly kind: 'artist'; readonly mbid: string };

export interface CatalogTrack {
  readonly provider: string;
  readonly title: string;
  readonly artist: string;
  readonly url: string;
  readonly isrc: string | null;
  readonly upc: string | null;
  readonly provenance: string;
  readonly confidence: number;
}

export interface CatalogAlbum {
  readonly provider: string;
  readonly title: string;
  readonly artist: string;
  readonly url: string;
  readonly upc: string | null;
  readonly provenance: string;
  readonly confidence: number;
}

export interface ArtistCandidate {
  readonly name: string;
  readonly url: string;
  readonly mbid: string | null;
  readonly links: readonly ResolvedDspLink[];
  readonly metadata?: ResolvedArtistMetadata;
}

export interface InHouseSources {
  trackByIsrc(
    isrc: string,
    territory: string
  ): Promise<readonly CatalogTrack[]>;
  trackByUrl(url: string, territory?: string): Promise<CatalogTrack | null>;
  searchTracks(
    artist: string,
    title: string,
    territory?: string
  ): Promise<readonly CatalogTrack[]>;
  albumByUpc(upc: string, territory?: string): Promise<CatalogAlbum | null>;
  albumByUrl(url: string, territory?: string): Promise<CatalogAlbum | null>;
  searchAlbums(
    artist: string,
    title: string,
    territory?: string
  ): Promise<readonly CatalogAlbum[]>;
  artistCandidates(name: string): Promise<readonly ArtistCandidate[]>;
  artistByUrl(url: string): Promise<readonly ArtistCandidate[]>;
  artistByMbid(mbid: string): Promise<ArtistCandidate | null>;
  urlRelsForIsrc(isrc: string): Promise<readonly ResolvedDspLink[]>;
}
