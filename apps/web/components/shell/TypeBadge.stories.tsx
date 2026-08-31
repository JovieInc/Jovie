import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TypeBadge } from './TypeBadge';

const meta = {
  title: 'Shell/TypeBadge',
  component: TypeBadge,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['label'],
    },
  },
} satisfies Meta<typeof TypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
