import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ReleasePropertiesPanel } from './ReleasePropertiesPanel';
import type { Release } from './types';

const mockRelease = {
  id: 'rel_1',
  title: 'Midnight Drive',
  releaseType: 'single',
  releaseDate: '2026-11-14',
  totalTracks: 1,
  totalDurationMs: 214000,
  isExplicit: false,
  upc: '888880123456',
  primaryIsrc: 'USRC17607839',
  label: 'Independent',
  distributor: 'DistroKid',
  genres: ['pop', 'electronic'],
  copyrightLine: '2026 Example Artist',
  spotifyPopularity: 42,
  canvasStatus: 'not_set',
} as unknown as Release;

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-80 bg-surface-0'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='w-80 bg-surface-0'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the release properties panel. The canonical stories stay
 * in ReleasePropertiesPanel.stories.tsx; these use the same release and
 * change which properties are known, their length and the direction.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/ReleasePropertiesPanel States',
  component: ReleasePropertiesPanel,
  parameters: {
    layout: 'centered',
  },
  decorators: [Frame],
  args: {
    release: mockRelease,
    isEditable: false,
    showCredits: false,
  },
} satisfies Meta<typeof ReleasePropertiesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no UPC, ISRC, label, genres or copyright yet. */
export const PartialMissingIdentifiers: Story = {
  args: {
    release: {
      ...mockRelease,
      upc: null,
      primaryIsrc: null,
      label: null,
      genres: [],
      copyrightLine: null,
    } as unknown as Release,
  },
};

/** Long content: a long label, many genres and a long copyright line. */
export const LongContentProperties: Story = {
  args: {
    release: {
      ...mockRelease,
      label: 'The Northern Hemisphere Independent Recording Collective Limited',
      genres: ['pop', 'electronic', 'synthwave', 'dream pop', 'indie dance'],
      copyrightLine:
        '2026 Example Artist under exclusive licence to The Northern Hemisphere Independent Recording Collective Limited',
    } as unknown as Release,
  },
};

/** Right-to-left: the panel inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    release: { ...mockRelease, label: 'تسجيلات مستقلة' } as unknown as Release,
  },
  decorators: [RtlFrame],
};
