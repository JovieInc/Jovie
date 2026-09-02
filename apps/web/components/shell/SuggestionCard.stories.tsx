import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SuggestionCard } from './SuggestionCard';

const meta = {
  title: 'Shell/SuggestionCard',
  component: SuggestionCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['title', 'body', 'actionLabel', 'disabled'],
    },
  },
} satisfies Meta<typeof SuggestionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
