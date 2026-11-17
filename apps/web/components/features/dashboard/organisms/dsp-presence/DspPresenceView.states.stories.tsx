import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import {
  DashboardStoryProviders,
  DEFAULT_DASHBOARD_DATA,
} from '@/.storybook/dashboard-fixtures';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { DspPresenceView } from './DspPresenceView';

const profileId = '00000000-0000-4000-8000-000000000001';
const artistId = '4Uwpa6zW3zzCSQvooQNksm';

const confirmed: DspPresenceItem = {
  matchId: 'match-apple',
  providerId: 'apple_music',
  status: 'confirmed',
  confidenceScore: 1,
  matchingIsrcCount: 12,
  matchSource: 'manual',
  confirmedAt: '2026-11-01T00:00:00Z',
  externalArtistName: 'Sasha Waves',
  externalArtistUrl: 'https://music.apple.com/us/artist/sasha-waves/123456',
  externalArtistImageUrl: null,
  confidenceBreakdown: null,
};

function dashboardData(isAdmin: boolean): DashboardData {
  return {
    ...DEFAULT_DASHBOARD_DATA,
    isAdmin,
    selectedProfile: {
      ...DEFAULT_DASHBOARD_DATA.selectedProfile,
      id: profileId,
      spotifyId: artistId,
      spotifyUrl: null,
    } as DashboardData['selectedProfile'],
  };
}

/** Answers the two reads the view makes; anything else fails loudly. */
function LocalPresenceApi({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async input => {
      const url = String(input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      if (url.startsWith('/api/dsp/enrichment/status'))
        return json({ success: true, status: { phase: 'complete' } });
      if (url.startsWith('/api/dsp/catalog-scan/results'))
        return json({ scan: null, mismatches: [] });
      throw new Error(`Unexpected request in isolated presence story: ${url}`);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, []);
  return <>{children}</>;
}

const withPresenceProviders: Decorator = function WithPresenceProviders(
  Story,
  context
) {
  return (
    <DashboardStoryProviders
      dashboardData={context.parameters.dashboardData as DashboardData}
    >
      <LocalPresenceApi>
        <Story />
      </LocalPresenceApi>
    </DashboardStoryProviders>
  );
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Dashboard/DspPresence/DspPresenceView States',
  component: DspPresenceView,
  parameters: {
    layout: 'fullscreen',
    dashboardData: dashboardData(true),
  },
  args: {
    data: { items: [confirmed], confirmedCount: 1, suggestedCount: 0 },
    hasUnresolvedMismatches: false,
  },
  decorators: [withPresenceProviders],
} satisfies Meta<typeof DspPresenceView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Non-admin members see the list but not the re-scan control. */
export const PermissionDeniedNonAdmin: Story = {
  parameters: { dashboardData: dashboardData(false) },
  args: {
    data: { items: [confirmed], confirmedCount: 1, suggestedCount: 1 },
  },
};

export const LongContentNames: Story = {
  args: {
    data: {
      items: [
        {
          ...confirmed,
          externalArtistName:
            'Sasha Waves and the International Orchestra of Experimental Electronic Music',
        },
        ...(
          [
            'spotify',
            'deezer',
            'tidal',
            'youtube_music',
            'soundcloud',
            'amazon_music',
          ] as const
        ).map(providerId => ({
          ...confirmed,
          matchId: `match-${providerId}`,
          providerId,
          matchSource: null,
          status: 'suggested' as const,
        })),
      ],
      confirmedCount: 1,
      suggestedCount: 6,
    },
  },
};

export const RtlDocument: Story = {
  decorators: [withRtl],
  args: {
    data: {
      items: [
        { ...confirmed, externalArtistName: 'ساشا ويفز' },
        {
          ...confirmed,
          matchId: 'match-spotify',
          providerId: 'spotify',
          externalArtistName: 'סשה ווייבס',
          status: 'suggested',
        },
      ],
      confirmedCount: 1,
      suggestedCount: 1,
    },
  },
};
