import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProviderStatusDot } from './ProviderStatusDot';

const meta = {
  title: 'Features/Dashboard/Organisms/Releases/Components/ProviderStatusDot',
  component: ProviderStatusDot,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['status', 'accent'],
    },
  },
} satisfies Meta<typeof ProviderStatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
