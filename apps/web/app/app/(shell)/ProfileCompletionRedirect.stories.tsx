import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  DASHBOARD_FIXTURE_PROFILE,
  DashboardStoryProviders,
  DEFAULT_DASHBOARD_DATA,
} from '@/.storybook/dashboard-fixtures';
import type { DashboardData } from './dashboard/actions/dashboard-data';
import { ProfileCompletionRedirect } from './ProfileCompletionRedirect';

/**
 * The guard returns null in every state. With an incomplete or missing
 * profile it only calls router.replace to the onboarding start, which the
 * Storybook navigation mock absorbs, so the frame never changes. Stories
 * mount it with a finished profile, the state every signed-in route sees.
 */
const COMPLETE_PROFILE_DATA = {
  ...DEFAULT_DASHBOARD_DATA,
  selectedProfile: {
    ...DASHBOARD_FIXTURE_PROFILE,
    username: 'sashawaves',
    usernameNormalized: 'sashawaves',
    displayName: 'Sasha Waves',
    isPublic: true,
    onboardingCompletedAt: new Date('2026-01-02T00:00:00.000Z'),
  },
} as DashboardData;

const meta = {
  title: 'App/Shell/ProfileCompletionRedirect',
  component: ProfileCompletionRedirect,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ProfileCompletionRedirect>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A finished profile: the guard stays mounted and draws nothing. */
export const MountedCompleteProfile: Story = {
  render: () => (
    <DashboardStoryProviders dashboardData={COMPLETE_PROFILE_DATA}>
      <div className='min-h-40 bg-base p-8 text-primary-token'>
        <p className='text-sm'>
          The onboarding guard mounts with no visible chrome. A finished profile
          keeps the visitor on the current route.
        </p>
        <ProfileCompletionRedirect />
      </div>
    </DashboardStoryProviders>
  ),
};
