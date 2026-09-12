import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InspectorEmpty } from './InspectorEmpty';

const meta = {
  title: 'Molecules/Inspector/InspectorEmpty',
  component: InspectorEmpty,
  parameters: {
    layout: 'centered',
  },
  args: {
    message: 'No assets for this object.',
  },
} satisfies Meta<typeof InspectorEmpty>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
