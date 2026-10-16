import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DesktopQrOverlay } from './DesktopQrOverlay';

const meta = {
  title: 'Profile/DesktopQrOverlay',
  component: DesktopQrOverlay,
  args: {
    handle: 'testartist',
  },
} satisfies Meta<typeof DesktopQrOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
