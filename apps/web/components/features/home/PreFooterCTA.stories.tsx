import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PreFooterCTA } from './PreFooterCTA';

const meta = {
  title: 'Marketing/PreFooterCTA',
  component: PreFooterCTA,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof PreFooterCTA>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
