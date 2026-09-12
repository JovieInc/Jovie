import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InspectorLoading } from './InspectorLoading';

const meta = {
  title: 'Molecules/Inspector/InspectorLoading',
  component: InspectorLoading,
  parameters: {
    layout: 'centered',
  },
  args: {
    rows: 4,
  },
} satisfies Meta<typeof InspectorLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
