import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeNotificationCard } from './HomeNotificationCard';

const meta = {
  title: 'Features/Home/HomeNotificationCard',
  component: HomeNotificationCard,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HomeNotificationCard>;

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Right-to-left: the card inside an Arabic document direction. */
export const RtlDocument: Story = {
  decorators: [withRtlDocument],
};
