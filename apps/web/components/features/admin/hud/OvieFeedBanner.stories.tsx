import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OvieFeedBanner } from './OvieFeedBanner';

const meta = {
  title: 'Features/Admin/Hud/OvieFeedBanner',
  component: OvieFeedBanner,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof OvieFeedBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = { args: { status: { level: 'live', stale: [] } } };
export const Stale: Story = {
  args: {
    status: { level: 'stale', stale: [{ id: 'revenue', ageMs: 120_000 }] },
  },
};
export const Down: Story = {
  args: {
    status: {
      level: 'down',
      stale: [
        { id: 'shipping', ageMs: 900_000 },
        { id: 'funnel', ageMs: null },
      ],
    },
  },
};
