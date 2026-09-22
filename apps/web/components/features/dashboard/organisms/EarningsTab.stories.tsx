import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { EarningsTab } from './EarningsTab';

const mockDashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
} as unknown as DashboardData;

const meta: Meta<typeof EarningsTab> = {
  title: 'Dashboard/Earnings/EarningsTab',
  component: EarningsTab,
  parameters: {
    layout: 'padded',
    jovie: {
      uncoveredProps: ['label', 'value', 'icon', 'dataUrl', 'isLoading'],
    },
  },
  decorators: [
    Story => (
      <DashboardDataProvider value={mockDashboardData}>
        <div className='max-w-3xl'>
          <Story />
        </div>
      </DashboardDataProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
