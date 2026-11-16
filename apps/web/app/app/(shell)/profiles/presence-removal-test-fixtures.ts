import type {
  ProfilesWorkspaceData,
  ProfileWorkspaceSurfaceRow,
} from '@/components/features/presence/types';

export const row: ProfileWorkspaceSurfaceRow = {
  id: 'surface',
  rowType: 'surface',
  kind: 'social',
  platform: 'soundcloud',
  label: 'Artist',
  handle: null,
  url: 'https://soundcloud.com/artist',
  trackedUrl: null,
  qualificationStatus: 'qualified',
  isOfficial: true,
  monitoringState: 'active',
  rank: null,
  previousRank: null,
  lastObservedAt: null,
  removalTarget: {
    linkId: 'link',
    url: 'https://soundcloud.com/artist',
    version: 3,
  },
};
export const data: ProfilesWorkspaceData = {
  profileId: 'profile',
  artist: {
    name: 'Artist',
    username: 'artist',
    avatarUrl: null,
    isPublic: true,
  },
  rows: [row],
  monitoringLimit: null,
  monitoredCount: 1,
  qualifiedShare: 1,
  bestJovieRank: null,
  lastObservedAt: null,
  providerAvailable: false,
};
export const scope = {
  actorId: 'actor',
  workspaceId: 'profile',
  target: 'creator' as const,
};
export const liveLink = {
  id: 'link',
  url: row.url,
  version: 3,
  isActive: true,
  state: 'active',
};

export const navigationScopes = [
  { scenario: 'same owner', patch: null },
  { scenario: 'profile changed', patch: { profileId: 'other' } },
  { scenario: 'actor changed', patch: { userId: 'other' } },
  { scenario: 'session changed', patch: { sessionId: 'other' } },
  {
    scenario: 'impersonation changed',
    patch: { impersonationSubject: 'other' },
  },
  { scenario: 'away and back', patch: { profileId: 'other' } },
];

export const principal = {
  appActorId: 'actor',
  authUserId: 'actor',
  sessionId: 'session',
  impersonationSubject: null,
};
