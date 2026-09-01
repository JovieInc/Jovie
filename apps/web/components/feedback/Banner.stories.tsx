import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { Banner } from './Banner';

const meta = {
  title: 'Feedback/Banner',
  component: Banner,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Imports are paused',
    description: 'Jovie will resume sync when Spotify is reachable.',
    variant: 'info',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['info', 'success', 'warning', 'error'],
    },
  },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const Success: Story = {
  args: {
    title: 'Import complete',
    description: 'Your audience links are ready to review.',
    variant: 'success',
  },
};

export const Warning: Story = {
  args: {
    title: 'Import is taking longer than expected',
    description: 'You can keep editing while Jovie keeps checking platforms.',
    variant: 'warning',
  },
};

export const Error: Story = {
  args: {
    title: 'Import failed',
    description: 'Try again after checking the Spotify artist link.',
    variant: 'error',
  },
};

export const DismissibleWithAction: Story = {
  args: {
    title: 'Connection restored',
    description: 'Review the recovered profile matches.',
    variant: 'success',
    action: { label: 'Review', onClick: fn() },
    onDismiss: fn(),
  },
};

