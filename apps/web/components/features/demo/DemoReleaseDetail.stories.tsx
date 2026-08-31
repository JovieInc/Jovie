import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoReleaseDetail } from './DemoReleaseDetail';

const meta = {
  title: 'Features/Demo/DemoReleaseDetail',
  component: DemoReleaseDetail,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['release', 'onClose'],
    },
  },
} satisfies Meta<typeof DemoReleaseDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
