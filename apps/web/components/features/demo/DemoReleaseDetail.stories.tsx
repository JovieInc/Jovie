import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoReleaseDetail } from './DemoReleaseDetail';
import { DEMO_RELEASES } from './demo-fixtures';

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

export const Default: Story = {
  args: {
    release: DEMO_RELEASES[0],
    onClose: () => {},
  },
};
