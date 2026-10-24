import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsAppearanceSection } from './SettingsAppearanceSection';

function buildDashboardData(withProfile: boolean): DashboardData {
  return {
    user: { id: 'user_123' },
    creatorProfiles: [],
    selectedProfile: withProfile ? { id: 'profile_123' } : null,
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    isAdmin: false,
  } as unknown as DashboardData;
}

const meta: Meta<typeof SettingsAppearanceSection> = {
  title: 'Dashboard/Settings/SettingsAppearanceSection',
  component: SettingsAppearanceSection,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Theme and contrast controls for a creator with a selected profile. */
export const Default: Story = {
  decorators: [
    Story => (
      <DashboardDataProvider value={buildDashboardData(true)}>
        <TooltipProvider>
          <div className='max-w-3xl'>
            <Story />
          </div>
        </TooltipProvider>
      </DashboardDataProvider>
    ),
  ],
};

/** Without a selected profile the controls render disabled. */
export const NoSelectedProfile: Story = {
  decorators: [
    Story => (
      <DashboardDataProvider value={buildDashboardData(false)}>
        <TooltipProvider>
          <div className='max-w-3xl'>
            <Story />
          </div>
        </TooltipProvider>
      </DashboardDataProvider>
    ),
  ],
};
