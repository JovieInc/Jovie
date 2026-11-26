import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { ShellReleaseRow } from './ShellReleaseRow';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Lost in the Light',
  artistNames: ['Bahamas'],
  status: 'released',
  artworkUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f',
  slug: 'lost-in-the-light',
  smartLinkPath: '/lost-in-the-light',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  totalDurationMs: 214_000,
  releaseDate: '2026-06-15',
  weeklyStreams: 12_400,
  previewUrl: 'https://example.com/preview.mp3',
  primaryIsrc: null,
  upc: null,
};

function ListDecorator(Story: () => React.JSX.Element) {
  return (
    <ul
      aria-label='Releases'
      className='w-full max-w-md bg-surface-0 p-3 text-primary-token'
    >
      <Story />
    </ul>
  );
}

function RtlListDecorator(Story: () => React.JSX.Element) {
  return (
    <ul
      aria-label='Releases'
      dir='rtl'
      className='w-full max-w-md bg-surface-0 p-3 text-primary-token'
    >
      <Story />
    </ul>
  );
}

/**
 * Rendered states of a release row. The play control sits on a media scrim
 * that stays dark in both themes.
 */
const meta = {
  title: 'Dashboard/Releases/ShellReleaseRow/States',
  component: ShellReleaseRow,
  parameters: { layout: 'centered' },
  args: {
    release,
    isSelected: false,
    onSelect: fn(),
  },
} satisfies Meta<typeof ShellReleaseRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a draft with no preview audio, so no play scrim renders. */
export const PartialNoPreview: Story = {
  decorators: [ListDecorator],
  args: {
    release: { ...release, status: 'draft', previewUrl: null },
  },
};

/** Long content: a title and credit line that must truncate in one row. */
export const LongContentTruncated: Story = {
  decorators: [ListDecorator],
  args: {
    release: {
      ...release,
      title:
        'Lost in the Light of a Thousand Late Night Drives Through the Valley',
      artistNames: ['Bahamas', 'Tim White', 'Vigel', 'A Very Long Artist Name'],
    },
  },
};

/** Rtl: the row mirrors with logical spacing. */
export const RtlRow: Story = {
  decorators: [RtlListDecorator],
};
