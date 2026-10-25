import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HEADROOM_SCHEMA,
  type HeadroomReport,
} from '@/lib/ovie/home/github-headroom';
import { GithubHeadroomTile } from './GithubHeadroomTile';

const NOW = Date.parse('2026-10-25T06:30:00.000Z');
const window = (over: Record<string, unknown> = {}) => ({
  bucket: 'core',
  windowStart: '2026-10-25T06:00:00.000Z',
  limit: 5000,
  samples: 40,
  minRemaining: 3100,
  medianRemaining: 4200,
  exhaustedSamples: 0,
  emptyShare: 0,
  ...over,
});
const report = (over: Record<string, unknown> = {}): HeadroomReport => ({
  schema: HEADROOM_SCHEMA,
  generatedAt: '2026-10-25T06:30:00.000Z',
  windows: [window(over)],
});

const meta = {
  title: 'Features/Admin/Hud/GithubHeadroomTile',
  component: GithubHeadroomTile,
  parameters: { layout: 'padded' },
  args: { nowMs: NOW, report: report() },
} satisfies Meta<typeof GithubHeadroomTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};
export const BackOff: Story = {
  args: { report: report({ minRemaining: 900 }) },
};
export const Empty: Story = {
  args: { report: report({ minRemaining: 0, emptyShare: 0.05 }) },
};
export const Unknown: Story = { args: { report: null } };
