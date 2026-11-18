import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseArtworkThumb } from './ReleaseArtworkThumb';

const meta = {
  title: 'Atoms/ReleaseArtworkThumb',
  component: ReleaseArtworkThumb,
  parameters: { layout: 'centered' },
  args: {
    src: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    alt: 'Release artwork',
    size: 40,
  },
} satisfies Meta<typeof ReleaseArtworkThumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Error: the artwork URL fails to load (expired CDN link), so the tile falls back. */
export const ErrorBrokenArtworkUrl: Story = {
  args: {
    src: 'https://broken-url.example.com/releases/midnight-drive.jpg',
    alt: 'Midnight Drive',
    size: 56,
  },
};

/** Partial: the release exists but has no artwork yet. */
export const PartialMissingArtwork: Story = {
  args: {
    src: null,
    alt: 'Midnight Drive',
    size: 56,
  },
};

/** Right-to-left: release rows with Arabic and Hebrew titles. */
export const RtlReleaseRows: Story = {
  render: () => (
    <ul
      dir='rtl'
      className='flex w-64 flex-col gap-3 text-sm text-primary-token'
    >
      {(
        [
          [
            'ليالي القاهرة',
            'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
          ],
          ['حنين', null],
          ['שיר של יום חולין', null],
        ] as const
      ).map(([title, src]) => (
        <li className='flex items-center gap-3' key={title}>
          <ReleaseArtworkThumb src={src} alt={title} size={40} />
          <span className='min-w-0 truncate'>{title}</span>
        </li>
      ))}
    </ul>
  ),
};
