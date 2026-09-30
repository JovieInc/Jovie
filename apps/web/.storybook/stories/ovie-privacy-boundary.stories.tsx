import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useLayoutEffect } from 'react';
import { DashboardShellPrivacyBoundary } from '@/app/app/(shell)/DashboardShellPrivacyBoundary';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { DEFAULT_DASHBOARD_DATA } from '../dashboard-fixtures';
import { createSignedInApiMock } from '../signed-in-session';

const fixtureUser = DEFAULT_DASHBOARD_DATA.user;
if (!fixtureUser)
  throw new Error('Privacy story requires the signed-in fixture user');

const fixtureUserId = fixtureUser.id;

const MODE_KEY = 'ovie-privacy-fixture-mode';
const DEADLINE_KEY = 'ovie-privacy-fixture-deadline';
type FixtureWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

function PrivatePayload() {
  const data = useDashboardData();
  return (
    <div data-testid='private-payload' className='p-6 text-primary-token'>
      Private profile: {data.selectedProfile?.id}
    </div>
  );
}

function RecoveryFixture() {
  const deadline =
    sessionStorage.getItem(DEADLINE_KEY) ??
    new Date(Date.now() + 3_600_000).toISOString();
  sessionStorage.setItem(DEADLINE_KEY, deadline);
  const mode = sessionStorage.getItem(MODE_KEY) ?? 'unlocked';
  useLayoutEffect(() => {
    const target = window as FixtureWindow;
    const previous = target.__jovieApiMock;
    const signedIn = createSignedInApiMock();
    target.__jovieApiMock = request => {
      if (request.url.pathname !== '/api/ovie/privacy-lock')
        return signedIn(request);
      const current = sessionStorage.getItem(MODE_KEY) ?? 'unlocked';
      const method = request.init?.method ?? 'GET';
      const calls = JSON.parse(
        sessionStorage.getItem('ovie-privacy-fixture-calls') ?? '[]'
      ) as string[];
      sessionStorage.setItem(
        'ovie-privacy-fixture-calls',
        JSON.stringify([...calls, method])
      );
      if (method !== 'GET')
        throw new Error('The recovery fixture forbids privacy mutations');
      if (current === 'offline')
        throw new TypeError('Fixture transport unavailable');
      const enabled = current !== 'disabled';
      const locked = current === 'locked';
      return Response.json({
        enabled,
        locked,
        unlockedUntil: enabled && !locked ? deadline : null,
      });
    };
    return () => {
      target.__jovieApiMock = previous;
    };
  }, [deadline]);
  return (
    <DashboardShellPrivacyBoundary
      mode='ov'
      userId={fixtureUserId}
      dashboardData={{ ...DEFAULT_DASHBOARD_DATA, isAdmin: true }}
      initiallyLocked={mode === 'locked'}
      privacyEnabled={mode !== 'disabled'}
      lockedUntil={mode === 'locked' || mode === 'disabled' ? null : deadline}
      sidebarDefaultOpen
      previewPanelDefaultOpen={false}
      persistSidebarCollapsed={async () => {}}
      unlockedShellChrome={
        <span data-testid='private-chrome' className='sr-only'>
          Private chrome sentinel
        </span>
      }
    >
      <PrivatePayload />
    </DashboardShellPrivacyBoundary>
  );
}

const meta = {
  title: 'Guardrails/Ovie Privacy Boundary',
  component: RecoveryFixture,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RecoveryFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Recovery: Story = {};
