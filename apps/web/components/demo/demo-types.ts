export type DemoReleaseStatus = 'healthy' | 'warning' | 'error' | 'draft';

export interface DemoProviderLink {
  readonly id: string;
  readonly provider: string;
  readonly status: 'connected' | 'missing' | 'stale';
  readonly url?: string;
}

export interface DemoRelease {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly releaseDate: string;
  readonly status: DemoReleaseStatus;
  readonly note: string;
  readonly links: DemoProviderLink[];
}
