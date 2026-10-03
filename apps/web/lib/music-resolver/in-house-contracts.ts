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
}

export interface InHouseSources {
  trackByIsrc(
    isrc: string,
    territory: string
  ): Promise<readonly CatalogTrack[]>;
  trackByUrl(url: string): Promise<CatalogTrack | null>;
  searchTracks(artist: string, title: string): Promise<readonly CatalogTrack[]>;
  albumByUpc(upc: string): Promise<CatalogAlbum | null>;
  albumByUrl(url: string): Promise<CatalogAlbum | null>;
  searchAlbums(artist: string, title: string): Promise<readonly CatalogAlbum[]>;
  artistCandidates(name: string): Promise<readonly ArtistCandidate[]>;
  artistByUrl(url: string): Promise<ArtistCandidate | null>;
  artistByMbid(mbid: string): Promise<ArtistCandidate | null>;
  urlRelsForIsrc(isrc: string): Promise<readonly ResolvedDspLink[]>;
}
