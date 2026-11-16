import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import type { ProviderKey } from '@/lib/discography/types';
import { ReleaseSidebar } from './ReleaseSidebar';
import type { Release } from './types';

const mockRelease: Release = {
  profileId: 'profile-calvin',
  id: 'release-midnight-echo',
  title: 'Midnight Echo',
  artistNames: ['Example Artist'],
  status: 'released',
  releaseDate: '2026-01-15T00:00:00.000Z',
  slug: 'midnight-echo',
  smartLinkPath: '/example/midnight-echo',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  totalDiscs: 1,
  totalDurationMs: 181000,
};

const providerConfig = {} as Record<
  ProviderKey,
  { label: string; accent: string }
>;

/**
 * Swap fetch for the story only, so the sidebar's smart link analytics
 * request takes the given path; the real fetch comes back on unmount.
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

function SidebarFrame(Story: () => ReactNode) {
  return (
    <div className='relative h-screen w-full bg-surface-0'>
      <Story />
    </div>
  );
}

function RtlSidebarFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='relative h-screen w-full bg-surface-0'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the release sidebar. Default, ReadOnly and Empty stay in
 * ReleaseSidebar.stories.tsx; these leave analytics to the sidebar's own
 * request (no analyticsOverride) and drive it with a fetch stub.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSidebar States',
  component: ReleaseSidebar,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    release: mockRelease,
    mode: 'admin',
    isOpen: true,
    providerConfig,
    artistName: 'Example Artist',
    onClose: () => undefined,
    onRefresh: () => undefined,
    showCredits: false,
  },
  decorators: [SidebarFrame],
} satisfies Meta<typeof ReleaseSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the smart link analytics request has not answered yet. */
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

/** Offline: the analytics request cannot reach the server at all. */
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

/** Long content: a long title, artist and smart link path. */
export const LongContentRelease: Story = {
  args: {
    release: {
      ...mockRelease,
      title:
        'A Very Long Release Title That Keeps Going Well Past The Sidebar Width (Extended Mix)',
      artistNames: ['An Artist With A Remarkably Long Stage Name'],
      smartLinkPath:
        '/an-artist-with-a-remarkably-long-stage-name/a-very-long-release-title-extended-mix',
    },
    artistName: 'An Artist With A Remarkably Long Stage Name',
    analyticsOverride: null,
  },
};

/** Right-to-left: the populated sidebar inside an RTL document. */
export const RtlDocument: Story = {
  args: { analyticsOverride: null },
  decorators: [RtlSidebarFrame],
};
