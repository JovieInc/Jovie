import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { expect, within } from 'storybook/test';
import { CatalogHealthSection } from './CatalogHealthSection';
import type { CatalogMismatch, CatalogScan } from './types';

const profileId = '00000000-0000-4000-8000-000000000001';
const scan: CatalogScan = {
  id: '00000000-0000-4000-8000-000000000002',
  status: 'completed',
  matchedCount: 0,
  catalogIsrcCount: 1,
  coveragePct: '0.00',
  albumsScanned: 1,
  tracksScanned: 1,
  error: null,
  completedAt: '2026-10-14T00:00:00Z',
};
const unobserved: CatalogMismatch = {
  id: '00000000-0000-4000-8000-000000000003',
  scanId: scan.id,
  creatorProfileId: profileId,
  isrc: 'USAAA2600001',
  mismatchType: 'missing_from_dsp',
  externalTrackId: null,
  externalTrackName: null,
  externalAlbumName: null,
  externalAlbumId: null,
  externalArtworkUrl: null,
  externalArtistNames: null,
  status: 'flagged',
  dismissedAt: null,
  dismissedReason: null,
  dedupKey: `${profileId}:USAAA2600001:spotify`,
  createdAt: '2026-10-14T00:00:00Z',
  updatedAt: '2026-10-14T00:00:00Z',
};
type Fixture = { scan: CatalogScan | null; mismatches: CatalogMismatch[] };
const legacy: Fixture = { scan, mismatches: [unobserved] };

function LocalCatalogApi({
  fixture,
  children,
}: {
  fixture: Fixture;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (
        String(input) ===
          `/api/dsp/catalog-scan/results?profileId=${profileId}` &&
        (!init?.method || init.method === 'GET')
      ) {
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error('Unexpected request in isolated catalog story.');
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [fixture]);
  return <div className='w-full max-w-md'>{children}</div>;
}

const meta = {
  title: 'Dashboard/DspPresence/CatalogHealthSection',
  component: CatalogHealthSection,
  parameters: {
    layout: 'centered',
    docs: { story: { inline: false } },
    catalogFixture: legacy,
  },
  args: { profileId, spotifyId: 'a'.repeat(22), hasUnresolvedMismatches: true },
  decorators: [
    (Story, context) => (
      <LocalCatalogApi fixture={context.parameters.catalogFixture as Fixture}>
        <Story />
      </LocalCatalogApi>
    ),
  ],
} satisfies Meta<typeof CatalogHealthSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LegacyUnobserved: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/Spotify availability is unverified/)
    ).toBeVisible();
    await expect(canvas.queryByText(/All clear/)).not.toBeInTheDocument();
  },
};
export const FailedObservation: Story = {
  parameters: {
    catalogFixture: {
      scan: {
        ...scan,
        status: 'failed',
        error: 'Spotify availability remains unknown.',
      },
      mismatches: [],
    } satisfies Fixture,
  },
};
export const MatchedInventory: Story = {
  parameters: {
    catalogFixture: {
      scan: { ...scan, matchedCount: 1, coveragePct: '100.00' },
      mismatches: [],
    } satisfies Fixture,
  },
};
