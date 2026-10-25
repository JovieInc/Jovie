import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DisplayConnectView } from './DisplayConnect';

const meta = {
  title: 'Features/Admin/Hud/DisplayConnect',
  component: DisplayConnectView,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DisplayConnectView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connecting: Story = { args: { failed: false } };
export const Failed: Story = { args: { failed: true } };
