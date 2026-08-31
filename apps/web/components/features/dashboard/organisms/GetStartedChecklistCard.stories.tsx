import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GetStartedChecklistCard } from './GetStartedChecklistCard';

const meta = {
  title: 'Features/Dashboard/Organisms/GetStartedChecklistCard',
  component: GetStartedChecklistCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['userId'],
    },
  },
} satisfies Meta<typeof GetStartedChecklistCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
