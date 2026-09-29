import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Users } from 'lucide-react';
import { AnalyticsCard } from './AnalyticsCard';

const meta = {
  title: 'Dashboard/Atoms/AnalyticsCard',
  component: AnalyticsCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Profile Views',
    value: '12,483',
    icon: Users,
  },
} satisfies Meta<typeof AnalyticsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = {
  render: args => (
    <div className='w-64'>
      <AnalyticsCard {...args} />
    </div>
  ),
};

export const WithMetadata: Story = {
  args: {
    metadata: '+12% vs last month',
  },
  render: args => (
    <div className='w-64'>
      <AnalyticsCard {...args} />
    </div>
  ),
};

export const Hero: Story = {
  args: {
    variant: 'hero',
    title: 'Monthly Recurring Revenue',
    value: '$4,820',
    children: '+8% vs last month',
  },
};
