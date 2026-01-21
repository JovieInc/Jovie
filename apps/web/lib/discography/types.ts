export type ProviderKey =
  | 'spotify'
  | 'apple_music'
  | 'youtube'
  | 'soundcloud'
  | 'deezer'
  | 'tidal'
  | 'amazon_music'
  | 'bandcamp'
  | 'beatport';

export type ProviderSource = 'ingested' | 'manual';

export interface ProviderLink {
  key: ProviderKey;
  url: string;
  source: ProviderSource;
  updatedAt: string;
}

export interface ReleaseTemplate {
  id: string;
  title: string;
  releaseDate?: string;
  artworkUrl?: string;
  providers: Partial<Record<ProviderKey, string>>;
}

export interface ReleaseRecord {
  id: string;
  title: string;
  releaseDate?: string;
  artworkUrl?: string;
  slug: string;
  providers: ProviderLink[];
}

export interface ReleaseViewModel {
  profileId: string;
  id: string;
  title: string;
  releaseDate?: string;
  artworkUrl?: string;
  slug: string;
  smartLinkPath: string;
  spotifyPopularity?: number | null;
  providers: Array<
    ProviderLink & {
      label: string;
      path: string;
      isPrimary: boolean;
    }
  >;
}
