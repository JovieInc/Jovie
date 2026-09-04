import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleaseFilterDropdown } from './ReleaseFilterDropdown';

const meta: Meta<typeof ReleaseFilterDropdown> = {
  title: 'Dashboard/Releases/ReleaseFilterDropdown',
  component: ReleaseFilterDropdown,
  args: {
    filters: {
      releaseTypes: ['album'],
      popularity: ['low'],
      labels: ['Republic'],
    },
    counts: {
      byType: {
        album: 5,
        ep: 2,
        single: 11,
        compilation: 1,
        live: 0,
        mixtape: 0,
        music_video: 0,
        other: 0,
      },
      byAvailability: {
        all: 19,
        complete: 12,
        incomplete: 7,
      },
      byPopularity: {
        low: 4,
        med: 8,
        high: 7,
      },
      byLabel: [
        { label: 'Republic', count: 6 },
        { label: 'Interscope', count: 3 },
      ],
    },
    onFiltersChange: fn(),
  },
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['buttonClassName', 'iconOnly', 'options'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
