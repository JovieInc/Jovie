import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { AccountSettingsSection } from './AccountSettingsSection';

const DASHBOARD_DATA = {
  selectedProfile: {
    id: 'story-profile',
    settings: { require_double_opt_in: true },
  },
} as DashboardData;

const meta = {
  title: 'Dashboard/Organisms/AccountSettings/AccountSettingsSection',
  component: AccountSettingsSection,
  parameters: {
    layout: 'padded',
  },
  args: {
    isGrowth: false,
  },
  decorators: [
    Story => (
      <DashboardDataProvider value={DASHBOARD_DATA}>
        <div className='max-w-2xl'>
          <Story />
        </div>
      </DashboardDataProvider>
    ),
  ],
} satisfies Meta<typeof AccountSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {};

export const SignedIn: Story = {
  decorators: [
    withSignedInSession,
    Story => (
      <JovieAuthValuesProvider>
        <Story />
      </JovieAuthValuesProvider>
    ),
  ],
};
