import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseFilterCounts } from './hooks/useReleaseFilterCounts';
import { ReleaseFilterDropdown } from './ReleaseFilterDropdown';

const EMPTY_COUNTS: ReleaseFilterCounts = {
  byType: {
    album: 0,
    ep: 0,
    single: 0,
    compilation: 0,
    live: 0,
    mixtape: 0,
    music_video: 0,
    other: 0,
  },
  byAvailability: { all: 0, complete: 0, incomplete: 0 },
  byPopularity: { low: 0, med: 0, high: 0 },
  byLabel: [],
};

const LONG_LABEL =
  'Northern Coastline Recordings and Publishing International Holdings';

const meta = {
  title: 'Dashboard/Releases/ReleaseFilterDropdown/States',
  component: ReleaseFilterDropdown,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['buttonClassName', 'iconOnly'] },
  },
  args: {
    filters: { releaseTypes: [], popularity: [], labels: [] },
    counts: EMPTY_COUNTS,
    onFiltersChange: fn(),
  },
} satisfies Meta<typeof ReleaseFilterDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a catalog with no releases, so every option count is zero. */
export const EmptyCatalog: Story = {};

/** Partial: only the release type dimension is filtered. */
export const PartialTypeFilterOnly: Story = {
  args: {
    filters: { releaseTypes: ['album'], popularity: [], labels: [] },
    counts: {
      ...EMPTY_COUNTS,
      byType: { ...EMPTY_COUNTS.byType, album: 5 },
    },
  },
};

/** Long content: a label name far wider than the active filter pill. */
export const LongContentLabelPill: Story = {
  args: {
    filters: { releaseTypes: [], popularity: [], labels: [LONG_LABEL] },
    counts: {
      ...EMPTY_COUNTS,
      byLabel: [{ label: LONG_LABEL, count: 9 }],
    },
  },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-72'>
          <Story />
        </div>
      );
    },
  ],
};

/** Rtl: the toolbar control inside a right-to-left container. */
export const RtlToolbar: Story = {
  args: {
    filters: { releaseTypes: ['single'], popularity: [], labels: ['شركة'] },
    counts: {
      ...EMPTY_COUNTS,
      byType: { ...EMPTY_COUNTS.byType, single: 3 },
      byLabel: [{ label: 'شركة', count: 3 }],
    },
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
