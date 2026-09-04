import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MetadataAgentPanel } from './MetadataAgentPanel';

const meta = {
  title: 'Features/Dashboard/ReleaseTasks/MetadataAgentPanel',
  component: MetadataAgentPanel,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['profileId', 'releaseId', 'releaseTitle', 'disabled'],
    },
  },
} satisfies Meta<typeof MetadataAgentPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
