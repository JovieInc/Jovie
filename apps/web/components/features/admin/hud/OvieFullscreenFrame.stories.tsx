import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OvieFullscreenFrame } from './OvieFullscreenFrame';

const meta = {
  title: 'Features/Admin/Hud/OvieFullscreenFrame',
  component: OvieFullscreenFrame,
  parameters: { layout: 'fullscreen' },
  args: {
    status: { level: 'live', stale: [] },
    now: 1_800_000_000_000,
    children: <p className='text-primary-token'>Home renders here, scaled.</p>,
  },
} satisfies Meta<typeof OvieFullscreenFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};
