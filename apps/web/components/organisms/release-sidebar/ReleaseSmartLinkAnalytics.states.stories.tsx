import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { ReleaseSmartLinkAnalytics } from './ReleaseSmartLinkAnalytics';
import type { Release, ReleaseSidebarAnalytics } from './types';

const mockRelease: Release = {
  profileId: 'profile-calvin',
  id: 'release-im-not-alone-remixes',
  title: "I'm Not Alone Remixes",
  artistNames: ['Calvin Harris'],
  status: 'released',
  slug: 'im-not-alone-remixes',
  smartLinkPath: '/calvinharris/im-not-alone-remixes',
  providers: [],
  releaseType: 'ep',
  isExplicit: false,
  totalTracks: 4,
  totalDiscs: 1,
};

/**
 * Swap fetch for the story only, so the card's own analytics request takes
 * the given path; the real fetch comes back when the story unmounts.
 */
function stubFetch(impl: typeof globalThis.fetch) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = impl;
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-80 bg-surface-1 p-3'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='w-80 bg-surface-1 p-3'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the release smart link analytics card. The canonical
 * Ready and Empty stories stay in ReleaseSmartLinkAnalytics.stories.tsx;
 * these drive the card's own request or pass other analytics.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSmartLinkAnalytics States',
  component: ReleaseSmartLinkAnalytics,
  parameters: {
    layout: 'centered',
  },
  args: {
    release: mockRelease,
    artistName: 'Calvin Harris',
    variant: 'card',
  },
  decorators: [Frame],
} satisfies Meta<typeof ReleaseSmartLinkAnalytics>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the analytics request has not answered yet. */
export const LoadingAnalytics: Story = {
  beforeEach: stubFetch(() => new Promise<Response>(() => undefined)),
};

/** Error: the analytics endpoint answers with a server error. */
export const ErrorLoadingAnalytics: Story = {
  beforeEach: stubFetch(async () => new Response('{}', { status: 500 })),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Analytics unavailable')
    ).toBeVisible();
  },
};

/** Offline: the request cannot reach the server at all. */
export const OfflineAnalytics: Story = {
  beforeEach: stubFetch(async () => {
    throw new TypeError('Failed to fetch');
  }),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Analytics unavailable')
    ).toBeVisible();
  },
};

const partialAnalytics: ReleaseSidebarAnalytics = {
  totalClicks: 18,
  last7DaysClicks: 0,
  lastClickAt: null,
  providerClicks: [],
};

/** Partial: clicks are counted but no last-click time or top provider is known. */
export const PartialAnalytics: Story = {
  args: { analyticsOverride: partialAnalytics },
};

/** Long content: very large counts and a long smart link path. */
export const LongContentCounts: Story = {
  args: {
    release: {
      ...mockRelease,
      smartLinkPath:
        '/calvinharris/im-not-alone-remixes-extended-deluxe-anniversary-edition',
    },
    analyticsOverride: {
      totalClicks: 1_284_903_211,
      last7DaysClicks: 9_884_120,
      lastClickAt: '2026-08-20T15:04:00.000Z',
      providerClicks: [{ provider: 'youtube_music', clicks: 600_000_000 }],
    },
  },
};

/** Right-to-left: the populated card inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    analyticsOverride: {
      totalClicks: 1842,
      last7DaysClicks: 126,
      lastClickAt: '2026-08-20T15:04:00.000Z',
      providerClicks: [{ provider: 'spotify', clicks: 940 }],
    },
  },
  decorators: [RtlFrame],
};
