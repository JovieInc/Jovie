import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ReleaseArtwork } from './ReleaseArtwork';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-80'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the release artwork header. The canonical stories stay
 * in ReleaseArtwork.stories.tsx; these change which details the release has,
 * the copy length and the document direction.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseArtwork States',
  component: ReleaseArtwork,
  parameters: {
    layout: 'centered',
  },
  args: {
    artworkUrl: 'https://placehold.co/600x600',
    title: 'Midnight Drive',
    artistName: 'Jordan Lee',
    canUploadArtwork: false,
    allowDownloads: false,
    releaseId: 'release-1',
  },
} satisfies Meta<typeof ReleaseArtwork>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no title, no artist and no artwork yet; the header falls back to "Release". */
export const PartialMissingDetails: Story = {
  args: { artworkUrl: null, title: '', artistName: null },
};

/** Long content: a long title and artist line in a narrow sidebar. */
export const LongContentTitle: Story = {
  args: {
    title:
      'Midnight Drive (Extended Deluxe Edition with Bonus Remixes and Live Recordings)',
    artistName:
      'Jordan Lee, The Northern Hemisphere Orchestra, and Friends of the Late Show',
  },
  decorators: [Frame],
};

/** Right-to-left: the header inside an RTL document. */
export const RtlDocument: Story = {
  args: { title: 'قيادة منتصف الليل', artistName: 'جوردان لي' },
  decorators: [RtlFrame],
};
