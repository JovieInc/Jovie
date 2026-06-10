import type { LibraryShareDropLayout } from '@/lib/db/schema/library-share-drops';

export interface LibraryShareDropAsset {
  readonly id: string;
  readonly releaseId: string;
  readonly title: string;
  readonly artistName: string;
  readonly artworkUrl: string | null;
  readonly previewUrl: string | null;
  readonly lyrics: string | null;
  readonly releaseType: string;
  readonly releaseDate: string | null;
  readonly smartLinkPath: string;
  readonly includeArtwork: boolean;
  readonly includePreview: boolean;
  readonly includeLyrics: boolean;
}

export interface LibraryShareDropPublicView {
  readonly token: string;
  readonly title: string;
  readonly message: string | null;
  readonly layout: LibraryShareDropLayout;
  readonly downloadsEnabled: boolean;
  readonly requiresPassphrase: boolean;
  readonly isExpired: boolean;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly artistAvatarUrl: string | null;
  readonly accentColor: string | null;
  readonly logoUrl: string | null;
  readonly darkMode: boolean;
  readonly assets: readonly LibraryShareDropAsset[];
}

export interface CreateLibraryShareDropInput {
  readonly title: string;
  readonly message?: string | null;
  readonly layout?: LibraryShareDropLayout;
  readonly downloadsEnabled?: boolean;
  readonly passphrase?: string | null;
  readonly expiresAt?: string | null;
  readonly releaseIds: readonly string[];
}

export interface CreateLibraryShareDropResult {
  readonly id: string;
  readonly token: string;
  readonly shareUrl: string;
}
