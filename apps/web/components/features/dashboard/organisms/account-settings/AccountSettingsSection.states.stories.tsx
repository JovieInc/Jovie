import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { expect, within } from 'storybook/test';
import { createSignedInApiMock } from '@/.storybook/signed-in-session';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { AccountSettingsSection } from './AccountSettingsSection';

const DASHBOARD_DATA: DashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [],
  selectedProfile: {
    id: 'story-profile',
    username: 'storyprofile',
    usernameNormalized: 'storyprofile',
    displayName: 'Story Profile',
    avatarUrl: null,
  } as DashboardData['selectedProfile'],
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
    totalCount: 6,
    steps: [],
    profileIsLive: false,
  },
};

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

type SessionMode =
  | { kind: 'pending' }
  | { kind: 'signed-in'; user: Parameters<typeof createSignedInApiMock>[0] };

/** Installs the session mock and returns a function that restores the previous one. */
function installSessionMock(mode: SessionMode): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  const signedIn =
    mode.kind === 'signed-in' ? createSignedInApiMock(mode.user) : null;
  apiMockWindow.__jovieApiMock = request => {
    if (
      mode.kind === 'pending' &&
      request.url.pathname.endsWith('/get-session')
    )
      return new Promise<Response>(() => undefined);
    return signedIn?.(request) ?? previous?.(request);
  };
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

/**
 * Registers the session mock during first render (as withSignedInSession
 * does) so it precedes the auth client's mount-time fetch.
 */
function SessionBoundary({
  mode,
  children,
}: Readonly<{ mode: SessionMode; children: ReactNode }>) {
  const [restore] = useState(() => installSessionMock(mode));
  useEffect(() => restore, [restore]);
  return <>{children}</>;
}

function session(mode: SessionMode) {
  return function SessionDecorator(Story: ComponentType) {
    return (
      <SessionBoundary mode={mode}>
        <JovieAuthValuesProvider>
          <Story />
        </JovieAuthValuesProvider>
      </SessionBoundary>
    );
  };
}

function withDashboardData(Story: ComponentType) {
  return (
    <DashboardDataProvider value={DASHBOARD_DATA}>
      <div className='max-w-2xl'>
        <Story />
      </div>
    </DashboardDataProvider>
  );
}

function withRtl(Story: ComponentType) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** State coverage for Settings, Account; same dashboard data as the base stories. */
const meta = {
  title: 'Dashboard/Organisms/AccountSettings/AccountSettingsSection States',
  component: AccountSettingsSection,
  parameters: { layout: 'padded' },
  args: { isGrowth: false },
  decorators: [withDashboardData],
} satisfies Meta<typeof AccountSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the session has not resolved, so identity and sessions hold their place. */
export const LoadingSession: Story = {
  decorators: [session({ kind: 'pending' })],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('account-identity-loading')
    ).toBeVisible();
  },
};

/** Empty: a signed-in account with no name or handle on file. */
export const EmptyIdentity: Story = {
  decorators: [
    session({
      kind: 'signed-in',
      user: { name: '', username: '' },
    }),
  ],
};

/** Long content: a long name, handle and email wrap inside the summary. */
export const LongContentIdentity: Story = {
  decorators: [
    session({
      kind: 'signed-in',
      user: {
        name: 'Bartholomew Maximilian Montgomery-Fitzgerald the Third',
        username: 'bartholomew_maximilian_montgomery_fitzgerald_official',
        email:
          'bartholomew.maximilian.montgomery.fitzgerald@international-music-collective.example.com',
      },
    }),
  ],
};

/** Right-to-left: the signed-in account inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [session({ kind: 'signed-in', user: {} }), withRtl],
};
