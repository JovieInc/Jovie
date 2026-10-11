import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileIntentPage } from './ProfileIntentPage';

const meta = {
  title: 'Features/Profile/ProfileIntentPage',
  component: ProfileIntentPage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    artistName: 'Tim White',
    artistHandle: 'tim',
    children: (
      <p className='text-sm text-secondary-token'>Listen view content</p>
    ),
  },
} satisfies Meta<typeof ProfileIntentPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Listen: Story = {
  args: {
    mode: 'listen',
  },
};

export const Tour: Story = {
  args: {
    mode: 'tour',
  },
};
