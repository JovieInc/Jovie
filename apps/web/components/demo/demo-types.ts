// ── Release lifecycle statuses (maps to Linear's issue status visual language) ──

export type ReleaseStatus =
  | 'live'
  | 'syncing'
  | 'scheduled'
  | 'draft'
  | 'archived';

export type ReleasePriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export type ReleaseType = 'Single' | 'EP' | 'Album';

export type DemoTab = 'releases' | 'audience' | 'analytics' | 'settings';

// ── Structured sub-types ──

export interface ReleaseLabel {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export interface DemoAssignee {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly color: string;
}

export interface DemoProviderLink {
  readonly id: string;
  readonly provider: string;
  readonly status: 'connected' | 'missing' | 'stale';
  readonly url?: string;
}

// ── Core release type ──

export interface DemoRelease {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly type: ReleaseType;
  readonly releaseDate: string;
  readonly status: ReleaseStatus;
  readonly priority: ReleasePriority;
  readonly labels: readonly ReleaseLabel[];
  readonly assignee: DemoAssignee;
  readonly trackCount: number;
  readonly streams: number;
  readonly gradient: string;
  readonly note: string;
  readonly links: readonly DemoProviderLink[];
  readonly createdAt: string;
}

// ── Filter state ──

export interface DemoFilters {
  readonly status: ReleaseStatus[];
  readonly search: string;
}
