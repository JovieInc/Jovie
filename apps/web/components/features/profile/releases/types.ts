export interface PublicRelease {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly releaseType: string;
  readonly releaseDate: string | null;
  readonly artworkUrl: string | null;
  readonly artistNames: readonly string[];
}
