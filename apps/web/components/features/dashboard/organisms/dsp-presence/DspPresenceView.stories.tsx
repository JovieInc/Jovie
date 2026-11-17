import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { expect, within } from 'storybook/test';
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

function profile(fields: {
  spotifyId: string | null;
  spotifyUrl: string | null;
}): DashboardData {
  return {
    ...DEFAULT_DASHBOARD_DATA,
    selectedProfile: {
      ...DEFAULT_DASHBOARD_DATA.selectedProfile,
      id: profileId,
      ...fields,
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

const meta = {
  title: 'Features/Dashboard/DspPresence/DspPresenceView',
  component: DspPresenceView,
  parameters: {
    layout: 'fullscreen',
    dashboardData: profile({ spotifyId: artistId, spotifyUrl: null }),
  },
  args: {
    data: { items: [confirmed], confirmedCount: 1, suggestedCount: 0 },
    hasUnresolvedMismatches: false,
  },
  decorators: [
    (Story, context) => (
      <DashboardStoryProviders
        dashboardData={context.parameters.dashboardData as DashboardData}
      >
        <LocalPresenceApi>
          <Story />
        </LocalPresenceApi>
      </DashboardStoryProviders>
    ),
  ],
} satisfies Meta<typeof DspPresenceView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SpotifyIdStored: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Catalog Health')).toBeVisible();
  },
};

/** Legacy profiles store only spotify_url; Catalog Health must still show. */
export const LegacySpotifyUrlOnly: Story = {
  parameters: {
    dashboardData: profile({
      spotifyId: null,
      spotifyUrl: `https://open.spotify.com/artist/${artistId}?si=abc`,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Catalog Health')).toBeVisible();
  },
};

export const NoSpotifyArtist: Story = {
  parameters: {
    dashboardData: profile({ spotifyId: null, spotifyUrl: null }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Sasha Waves')).toBeVisible();
    await expect(canvas.queryByText('Catalog Health')).not.toBeInTheDocument();
  },
};

export const EmptyPresence: Story = {
  args: { data: { items: [], confirmedCount: 0, suggestedCount: 0 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('No DSP Profiles Found')
    ).toBeVisible();
  },
};
