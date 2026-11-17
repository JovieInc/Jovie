import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { userSettingsNavigation } from '@/features/dashboard/dashboard-nav/config';
import { SettingsNavGroup } from './SettingsNavGroup';

const meta = {
  title: 'Organisms/SettingsNavGroup',
  component: SettingsNavGroup,
  decorators: [
    Story => (
      <TooltipProvider>
        <SidebarProvider>
          <div className='w-56 bg-sidebar p-3'>
            <Story />
          </div>
        </SidebarProvider>
      </TooltipProvider>
    ),
  ],
  args: {
    items: userSettingsNavigation,
    pathname: APP_ROUTES.SETTINGS_ACCOUNT,
  },
} satisfies Meta<typeof SettingsNavGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { items: [] } };
export const ActiveDescendant: Story = {
  args: { pathname: `${APP_ROUTES.SETTINGS_ACCOUNT}/sessions` },
};
export const PrefetchOnFocus: Story = { args: { onPrefetch: fn() } };
export const LongContent: Story = {
  args: {
    items: userSettingsNavigation.map(item => ({
      ...item,
      name: `${item.name} with a longer navigation label`,
    })),
  },
};
export const RtlOverflow: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
