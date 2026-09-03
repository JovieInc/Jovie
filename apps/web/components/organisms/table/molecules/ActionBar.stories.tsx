import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ActionBar } from './ActionBar';

const meta = {
  title: 'Organisms/Table/Molecules/ActionBar',
  component: ActionBar,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['tooltipLabel', 'label', 'icon'],
    },
  },
} satisfies Meta<typeof ActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
