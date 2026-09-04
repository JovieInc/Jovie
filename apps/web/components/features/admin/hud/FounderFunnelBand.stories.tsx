import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FounderFunnelBand } from './FounderFunnelBand';

const meta = {
  title: 'Features/Admin/Hud/FounderFunnelBand',
  component: FounderFunnelBand,
  parameters: {
    jovie: {
      uncoveredProps: ['isLoading'],
    },
    layout: 'centered',
  },
} satisfies Meta<typeof FounderFunnelBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
