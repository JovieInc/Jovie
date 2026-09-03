import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoSettingsPanel } from './DemoSettingsPanel';

const meta = {
  title: 'Features/Demo/DemoSettingsPanel',
  component: DemoSettingsPanel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DemoSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
