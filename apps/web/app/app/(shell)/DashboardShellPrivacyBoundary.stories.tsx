import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ComponentProps } from 'react';
import { expect, waitFor } from 'storybook/test';
import { DashboardShellPrivacyBoundary } from './DashboardShellPrivacyBoundary';
import type { DashboardData } from './dashboard/actions/dashboard-data';

const STORY_USER_ID = 'user-story';

const signedInData: DashboardData = {
  user: { id: STORY_USER_ID },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 0,
    steps: [],
    profileIsLive: false,
  },
};

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

type BoundaryProps = ComponentProps<typeof DashboardShellPrivacyBoundary>;

const meta = {
  title: 'App/Shell/DashboardShellPrivacyBoundary',
  component: DashboardShellPrivacyBoundary,
  parameters: { layout: 'fullscreen' },
  args: {
    mode: 'customer',
    userId: STORY_USER_ID,
    dashboardData: signedInData,
    initiallyLocked: false,
    privacyEnabled: false,
    lockedUntil: null,
    sidebarDefaultOpen: true,
    previewPanelDefaultOpen: false,
    persistSidebarCollapsed: async () => {},
    children: <p className='p-6 text-primary-token'>Chat</p>,
  },
  decorators: [
    Story => (
      <div className='h-160 w-full overflow-hidden bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DashboardShellPrivacyBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A signed-in account with no creator profile yet: the shell mounts with an
 * empty profile list and the route owns its own empty prompt. */
export const EmptyNoProfiles: Story = {
  args: {
    children: (
      <p className='p-6 text-secondary-token'>
        No profiles yet. Start a chat to set one up.
      </p>
    ),
  },
};

/** Ovie privacy lock is on and the server says locked: only the unlock
 * screen renders and the provider holds redacted data. */
export const PermissionDeniedLocked: Story = {
  args: {
    mode: 'ov',
    initiallyLocked: true,
    privacyEnabled: true,
    lockedUntil: null,
  } satisfies Partial<BoundaryProps>,
};

/** The lock check fails while unlocked: the boundary fails closed and offers
 * a manual retry. Only the privacy-lock route is stubbed. */
export const ErrorLockCheckFailed: Story = {
  args: {
    mode: 'ov',
    privacyEnabled: true,
    lockedUntil: inOneHour(),
  } satisfies Partial<BoundaryProps>,
  beforeEach: () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('/api/ovie/privacy-lock')) {
        return new Response(JSON.stringify({}), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  },
  play: async ({ canvas }) => {
    globalThis.dispatchEvent(new Event('focus'));
    await waitFor(() =>
      expect(canvas.getByText('Reconnecting to Ovie…')).toBeInTheDocument()
    );
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeEnabled();
  },
};

export const LongContentRoute: Story = {
  args: {
    children: (
      <div className='h-full overflow-auto p-6 text-primary-token'>
        {Array.from(
          { length: 30 },
          (_, index) =>
            `Message ${index + 1}: Midnight City (Extended Club Mix) is now pitched to every editorial playlist that matched its genre, mood and tempo.`
        ).map(line => (
          <p key={line} className='py-1'>
            {line}
          </p>
        ))}
      </div>
    ),
  },
};

export const RtlRoute: Story = {
  args: {
    children: (
      <div dir='rtl' lang='ar' className='p-6 text-primary-token'>
        <p>مرحبا بك في مساحة العمل. ابدأ محادثة جديدة لإدارة إصداراتك.</p>
      </div>
    ),
  },
};
