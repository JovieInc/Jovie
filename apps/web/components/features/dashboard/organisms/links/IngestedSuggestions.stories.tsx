import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IngestedSuggestions } from './IngestedSuggestions';

const meta = {
  title: 'Features/Dashboard/Organisms/Links/IngestedSuggestions',
  component: IngestedSuggestions,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['suggestions', 'onAccept', 'onDismiss'],
    },
  },
} satisfies Meta<typeof IngestedSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
