import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoShell } from './DemoShell';

const meta = {
  title: 'Features/Demo/DemoShell',
  component: DemoShell,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['activeTab', 'onTabChange'],
    },
  },
} satisfies Meta<typeof DemoShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
