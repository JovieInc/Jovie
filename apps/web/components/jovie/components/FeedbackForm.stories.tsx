import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FeedbackForm } from './FeedbackForm';

const meta = {
  title: 'Jovie/Components/FeedbackForm',
  component: FeedbackForm,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['onClose', 'disabled'],
    },
  },
} satisfies Meta<typeof FeedbackForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
