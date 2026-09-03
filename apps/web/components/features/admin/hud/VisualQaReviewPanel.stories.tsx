import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { VisualQaReviewPanel } from './VisualQaReviewPanel';

const meta = {
  title: 'Features/Admin/Hud/VisualQaReviewPanel',
  component: VisualQaReviewPanel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof VisualQaReviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
