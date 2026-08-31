import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoReleasesPanel } from './DemoReleasesPanel';

const meta = {
  title: 'Features/Demo/DemoReleasesPanel',
  component: DemoReleasesPanel,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['groups'],
    },
  },
} satisfies Meta<typeof DemoReleasesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
