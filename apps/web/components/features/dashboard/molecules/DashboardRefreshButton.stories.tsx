import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardRefreshButton } from './DashboardRefreshButton';

const meta: Meta<typeof DashboardRefreshButton> = {
  title: 'Dashboard/Molecules/DashboardRefreshButton',
  component: DashboardRefreshButton,
  parameters: {
    layout: 'padded',
  },
  args: {
    ariaLabel: 'Refresh',
    onRefresh: () => {},
    onRefreshed: () => {},
  },
  argTypes: {
    ariaLabel: { control: 'text' },
    className: { control: 'text' },
    onRefresh: { action: 'refresh' },
    onRefreshed: { action: 'refreshed' },
  },
};

export default meta;

type Story = StoryObj<typeof DashboardRefreshButton>;

export const Default: Story = {};
