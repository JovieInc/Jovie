import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseCountdown } from './ReleaseCountdown';

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

const meta = {
  title: 'Features/Release/ReleaseCountdown',
  component: ReleaseCountdown,
  parameters: {
    layout: 'centered',
  },
  args: {
    releaseDate: new Date(Date.now() + TEN_DAYS_MS),
  },
} satisfies Meta<typeof ReleaseCountdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
  args: {
    compact: true,
  },
};
