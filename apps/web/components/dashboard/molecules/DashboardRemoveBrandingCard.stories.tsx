import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardRemoveBrandingCard } from './DashboardRemoveBrandingCard';

const meta: Meta<typeof DashboardRemoveBrandingCard> = {
  title: 'Dashboard/Molecules/DashboardRemoveBrandingCard',
  component: DashboardRemoveBrandingCard,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    className: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof DashboardRemoveBrandingCard>;

export const Default: Story = {};

export const InSidebar: Story = {
  render: () => (
    <div className='w-[320px] rounded-xl border border-sidebar-border bg-sidebar-surface p-3'>
      <DashboardRemoveBrandingCard />
    </div>
  ),
};
