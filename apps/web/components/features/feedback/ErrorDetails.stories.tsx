import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ErrorDetails } from './ErrorDetails';

const meta = {
  title: 'Features/Feedback/ErrorDetails',
  component: ErrorDetails,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ErrorDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithErrorCollapsible: Story = {
  args: {
    error: Object.assign(new Error('Failed to fetch release data'), {
      digest: 'abc123',
    }),
    collapsible: true,
    showMessage: true,
  },
};
