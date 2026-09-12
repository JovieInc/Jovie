import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InspectorRow } from './InspectorRow';

const meta = {
  title: 'Molecules/Inspector/InspectorRow',
  component: InspectorRow,
  args: {
    label: 'ISRC',
    value: 'USRC17607839',
    size: 'sm' as const,
  },
} satisfies Meta<typeof InspectorRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
