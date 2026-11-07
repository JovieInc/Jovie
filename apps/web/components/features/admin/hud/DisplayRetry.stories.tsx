import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DisplayRetry } from './DisplayRetry';

const meta = {
  title: 'Features/Admin/Hud/DisplayRetry',
  component: DisplayRetry,
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
} satisfies Meta<typeof DisplayRetry>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reconnecting: Story = {};
