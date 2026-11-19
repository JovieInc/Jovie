import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Users } from 'lucide-react';
import { AnalyticsCard } from './AnalyticsCard';

/**
 * State coverage for AnalyticsCard. Same base args as the canonical stories;
 * each state changes only the caller-owned title, value, metadata or the
 * document direction.
 */
const meta = {
  title: 'Dashboard/Atoms/AnalyticsCard States',
  component: AnalyticsCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Profile Views',
    value: '12,483',
    icon: Users,
  },
  render: args => (
    <div className='w-64'>
      <AnalyticsCard {...args} />
    </div>
  ),
} satisfies Meta<typeof AnalyticsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only the required title and value, so the fallback icon and no subtitle. */
export const PartialTitleAndValueOnly: Story = {
  args: { icon: undefined },
};

/** Long content: a long title, a large value and long metadata wrap inside the card. */
export const LongContentWrapping: Story = {
  args: {
    title:
      'Profile views from smart links shared across every connected platform',
    value: '1,284,903,117',
    metadata:
      '+12% vs last month, driven mostly by release-day traffic from short-form video',
  },
};

/** Long content in the hero variant. */
export const LongContentHero: Story = {
  args: {
    variant: 'hero',
    title: 'Monthly recurring revenue across every paid plan and add-on',
    value: '$1,284,903',
    metadata: 'Up from $1,102,440 last month after the annual-plan launch',
  },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    title: 'مشاهدات الملف الشخصي',
    value: '12,483',
    metadata: '+12% مقارنة بالشهر الماضي',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
