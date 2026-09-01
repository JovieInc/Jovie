import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InlineChatArea } from './InlineChatArea';

const meta = {
  title: 'Dashboard/Organisms/InlineChatArea',
  component: InlineChatArea,
  parameters: {
    layout: 'centered',
  },
  args: {
    profileId: 'storybook-profile',
    expanded: true,
  },
  decorators: [
    Story => (
      <div className='max-w-full' style={{ width: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InlineChatArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};

export const Collapsed: Story = {
  args: {
    expanded: false,
  },
};
