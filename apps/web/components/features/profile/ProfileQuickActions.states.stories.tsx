import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { ProfileQuickActions } from './ProfileQuickActions';

function withRtlStage(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar' className='dark w-96 bg-base text-primary-token'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Profile/ProfileQuickActions States',
  component: ProfileQuickActions,
  parameters: { layout: 'centered' },
  args: {
    activeMode: 'profile',
    onModeSelect: fn(),
    onBookClick: fn(),
  },
} satisfies Meta<typeof ProfileQuickActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** RTL: the action row in a right-to-left document, Events active. */
export const RtlDocument: Story = {
  args: { activeMode: 'tour' },
  decorators: [withRtlStage],
};
