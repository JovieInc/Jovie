import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseMetadata } from './ReleaseMetadata';
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

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseMetadata/States',
  component: ReleaseMetadata,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    release: mockRelease,
  },
} satisfies Meta<typeof ReleaseMetadata>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a release with none of the optional metadata filled in. */
export const EmptyBareRelease: Story = {
  args: {
    release: {
      id: 'rel_2',
      title: 'Untitled',
      releaseType: 'single',
      totalTracks: 1,
      isExplicit: false,
    } as unknown as Release,
  },
};

/** Partial: a release with a label but no genres, UPC or popularity. */
export const PartialLabelOnly: Story = {
  args: {
    release: {
      id: 'rel_3',
      title: 'Half Done',
      releaseType: 'single',
      totalTracks: 1,
      isExplicit: true,
      label: 'Independent',
    } as unknown as Release,
  },
};

/** Long content: a long label, copyright line and several long genres. */
export const LongContentLabels: Story = {
  args: {
    release: {
      ...mockRelease,
      label: 'An Independent Label With An Extremely Long Imprint Name',
      copyrightLine:
        '2026 Example Artist Under Exclusive License To An Extremely Long Named Records Company',
      genres: [
        'progressive electronic dance music',
        'melodic house and techno',
        'ambient downtempo',
      ],
    } as unknown as Release,
  },
};
