import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  ProfilesWorkspaceData,
  ProfileWorkspaceSurfaceRow,
} from '@/app/app/(shell)/profiles/data';
import { ProfilesWorkspace } from '@/app/app/(shell)/profiles/ProfilesWorkspace';
import { AppShellRightRail } from '@/components/shell/AppShellRightRail';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import {
  MISSING_IDENTITY_PHOTO,
  type SourceIdentity,
} from '@/lib/profile-surfaces/presence-identity';
import { presenceWorkspaceScopeKey } from './workspace-controller';

const scope = {
  actorId: 'public-review-fixture',
  workspaceId: 'public-review-fixture',
  target: 'creator' as const,
};
const observedAt = '2026-10-08T01:00:00.000Z';
const sources = [
  {
    platform: 'soundcloud',
    kind: 'dsp',
    handle: '@itstimwhite',
    url: 'https://soundcloud.com/itstimwhite',
    image: new URL(
      '../../../assets/profile-source-review/soundcloud.jpg',
      import.meta.url
    ).href,
    status: 'available',
  },
  {
    platform: 'youtube',
    kind: 'social',
    handle: '@timwhite',
    url: 'https://www.youtube.com/@timwhite',
    image: new URL(
      '../../../assets/profile-source-review/youtube.jpg',
      import.meta.url
    ).href,
    status: 'available',
  },
  {
    platform: 'deezer',
    kind: 'dsp',
    handle: null,
    url: 'https://www.deezer.com/artist/1672092',
    image: new URL(
      '../../../assets/profile-source-review/deezer.jpg',
      import.meta.url
    ).href,
    status: 'available',
  },
  {
    platform: 'tidal',
    kind: 'dsp',
    handle: null,
    url: 'https://tidal.com/artist/4978855',
    image: null,
    status: 'available',
  },
  {
    platform: 'instagram',
    kind: 'social',
    handle: '@timwhite',
    url: 'https://instagram.com/timwhite',
    image: null,
    status: 'unsupported',
  },
] as const;

const rows: ProfileWorkspaceSurfaceRow[] = sources.map(source => ({
  id: `public-review-${source.platform}`,
  rowType: 'surface',
  kind: source.kind,
  platform: source.platform,
  label: 'Tim White',
  handle: source.handle,
  url: source.url,
  trackedUrl: null,
  // Simulated inventory state, not a statement of account ownership.
  qualificationStatus: 'qualified',
  isOfficial: false,
  monitoringState: 'unavailable',
  rank: null,
  previousRank: null,
  lastObservedAt: null,
  identityPhoto: source.image
    ? {
        url: source.image,
        source: 'public_metadata',
        kind: 'profile',
        verified: false,
        observedAt,
        freshness: 'current',
      }
    : MISSING_IDENTITY_PHOTO,
}));
const data: ProfilesWorkspaceData = {
  profileId: '', // No authenticated suggestion API calls in this public fixture.
  artist: {
    name: 'Tim White',
    username: 'tim',
    avatarUrl: null,
    isPublic: true,
  },
  rows,
  monitoringLimit: 0,
  monitoredCount: 0,
  qualifiedShare: 0,
  bestJovieRank: null,
  lastObservedAt: null,
  providerAvailable: false,
};

function FixturePanel() {
  const panel = useRightPanel();
  return panel ? <AppShellRightRail>{panel}</AppShellRightRail> : null;
}
function PublicSourcesFixture() {
  const [client] = useState(() => {
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    sources.forEach((source, index) => {
      const identity: SourceIdentity = {
        status: source.status,
        displayName: source.image ? 'Tim White' : null,
        pageTitle: source.platform === 'tidal' ? 'Tim White' : null,
        sourceUrl: source.url,
        photo:
          source.platform === 'tidal'
            ? {
                url: 'https://resources.tidal.com/images/0d033893/1532/4f1f/ba5d/9b9ec1f26cc2/750x750.jpg',
                source: 'public_metadata',
                kind: 'generic',
                verified: false,
                observedAt,
                freshness: 'current',
              }
            : (rows[index]?.identityPhoto ?? MISSING_IDENTITY_PHOTO),
      };
      cache.setQueryData(
        [
          'profile-source-identity',
          presenceWorkspaceScopeKey(scope),
          `public-review-${source.platform}`,
          source.url,
        ],
        identity
      );
    });
    return cache;
  });
  return (
    <QueryClientProvider client={client}>
      <HeaderActionsProvider>
        <RightPanelProvider>
          <section
            aria-label='Public source photo review fixture'
            className='space-y-3 p-3'
          >
            <div className='text-xs text-secondary-token'>
              <strong className='block text-primary-token'>
                Public source photo fixture · October 7, 2026
              </strong>
              Browser-observed SoundCloud, YouTube and Deezer portraits. Tidal
              is artwork; Instagram automatic inspection is unsupported. Review
              and monitoring states are simulated; this is not account ownership
              or production proof. Select a row to compare its source. Hover or
              keyboard-focus a row to inspect avatar emphasis.
            </div>
            <div className='relative h-160 overflow-hidden border border-subtle bg-surface-0'>
              <ProfilesWorkspace data={data} scope={scope} />
              <FixturePanel />
            </div>
          </section>
        </RightPanelProvider>
      </HeaderActionsProvider>
    </QueryClientProvider>
  );
}
const meta = {
  title: 'Presence/ProfilesPublicSources',
  component: PublicSourcesFixture,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/app/presence' } },
  },
} satisfies Meta<typeof PublicSourcesFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PublicPortraitsAndExceptions: Story = {};
