import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { WikiUnavailableNotice } from './WikiUnavailableNotice';

const meta = {
  title: 'Features/Admin/WikiUnavailableNotice',
  component: WikiUnavailableNotice,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof WikiUnavailableNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: the notice centred inside a right-to-left admin page. */
export const RtlNotice: Story = {
  decorators: [withRtl],
};
