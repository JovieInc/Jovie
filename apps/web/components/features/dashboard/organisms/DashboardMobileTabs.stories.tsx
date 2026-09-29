import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardMobileTabs } from './DashboardMobileTabs';

const meta = {
  title: 'Dashboard/Organisms/DashboardMobileTabs',
  component: DashboardMobileTabs,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: APP_ROUTES.DASHBOARD,
        query: {},
      },
    },
  },
  decorators: [withDashboardProviders],
  render: args => (
    <div className='flex min-h-[40rem] items-end bg-base'>
      <div className='w-full'>
        <DashboardMobileTabs {...args} />
      </div>
    </div>
  ),
} satisfies Meta<typeof DashboardMobileTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
