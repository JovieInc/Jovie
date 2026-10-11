import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleaseActionErrorCard } from './ReleaseActionErrorCard';

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseActionErrorCard',
  component: ReleaseActionErrorCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    message:
      "Couldn't publish this release. Check your connection and try again.",
    actionLabel: 'Retry',
    onRetry: fn(),
  },
} satisfies Meta<typeof ReleaseActionErrorCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = {};

export const WithTitleAndDismiss: Story = {
  args: {
    title: 'Publish failed',
    onDismiss: fn(),
  },
};

export const Inline: Story = {
  args: {
    variant: 'inline',
  },
};
