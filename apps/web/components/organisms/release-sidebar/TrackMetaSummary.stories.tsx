import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TrackMetaSummary } from './TrackMetaSummary';

const meta = {
  title: 'Organisms/ReleaseSidebar/TrackMetaSummary',
  component: TrackMetaSummary,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Midnight Drive',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 214000,
    isrc: 'USRC17607839',
  },
} satisfies Meta<typeof TrackMetaSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Compact: Story = {};

export const Drawer: Story = {
  args: {
    variant: 'drawer',
  },
};

export const Explicit: Story = {
  args: {
    isExplicit: true,
  },
};

export const MultiDisc: Story = {
  args: {
    discNumber: 2,
    trackNumber: 5,
  },
};
