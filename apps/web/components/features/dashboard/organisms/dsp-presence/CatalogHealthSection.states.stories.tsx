import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { CatalogHealthSection } from './CatalogHealthSection';
import type { CatalogScan } from './types';

const profileId = '00000000-0000-4000-8000-000000000001';
const scan: CatalogScan = {
  id: '00000000-0000-4000-8000-000000000002',
  status: 'completed',
  matchedCount: 12,
  catalogIsrcCount: 12,
  coveragePct: '100.00',
  albumsScanned: 2,
  tracksScanned: 12,
  error: null,
  completedAt: '2026-10-14T00:00:00Z',
};

type Fixture = { scan: CatalogScan | null; mismatches: never[] };

function LocalCatalogApi({
  fixture,
  children,
}: {
  readonly fixture: Fixture | 'offline' | 'pending';
  readonly children: ReactNode;
}) {
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      if (fixture === 'offline') throw new TypeError('Failed to fetch');
      if (fixture === 'pending') return new Promise<Response>(() => undefined);
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [fixture]);
  return <div className='w-full max-w-md'>{children}</div>;
}

const meta = {
  title: 'Dashboard/DspPresence/CatalogHealthSection/States',
  component: CatalogHealthSection,
  parameters: {
    layout: 'centered',
    catalogFixture: { scan: null, mismatches: [] },
  },
  args: { profileId, spotifyId: 'a'.repeat(22), hasUnresolvedMismatches: true },
  decorators: [
    function CatalogApiDecorator(Story, context) {
      return (
        <LocalCatalogApi
          fixture={
            context.parameters.catalogFixture as Fixture | 'offline' | 'pending'
          }
        >
          <Story />
        </LocalCatalogApi>
      );
    },
  ],
} satisfies Meta<typeof CatalogHealthSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the catalog has never been scanned. */
export const Empty: Story = {};

/** Loading: the results request never resolves. */
export const Loading: Story = {
  parameters: { catalogFixture: 'pending' },
};

/** Offline: the results request fails. */
export const Offline: Story = {
  parameters: { catalogFixture: 'offline' },
};

/** Partial: a completed scan with full coverage and nothing to review. */
export const PartialAllClear: Story = {
  parameters: { catalogFixture: { scan, mismatches: [] } },
};

/** Error: the last scan failed. */
export const ErrorScanFailed: Story = {
  parameters: {
    catalogFixture: {
      scan: {
        ...scan,
        status: 'failed',
        error: 'Spotify is unavailable.',
      },
      mismatches: [],
    },
  },
};

/** Long content: a failure message that wraps over several lines. */
export const LongContent: Story = {
  parameters: {
    catalogFixture: {
      scan: {
        ...scan,
        status: 'failed',
        error:
          'Spotify returned an unexpected response while reading the artist catalog, so availability could not be verified for any release.',
      },
      mismatches: [],
    },
  },
};

/** Rtl: right-to-left layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
