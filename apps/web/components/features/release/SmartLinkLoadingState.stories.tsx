import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SmartLinkLoadingState } from './SmartLinkLoadingState';

const meta = {
  title: 'Features/Release/SmartLinkLoadingState',
  component: SmartLinkLoadingState,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SmartLinkLoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
