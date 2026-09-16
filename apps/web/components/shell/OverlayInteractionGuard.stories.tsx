import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OverlayInteractionGuard } from './OverlayInteractionGuard';

const meta: Meta<typeof OverlayInteractionGuard> = {
  title: 'Shell/OverlayInteractionGuard',
  component: OverlayInteractionGuard,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
