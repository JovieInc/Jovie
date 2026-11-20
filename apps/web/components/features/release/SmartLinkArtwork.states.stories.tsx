import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SmartLinkArtwork } from './SmartLinkArtwork';

/**
 * Rendered states of the smart link artwork. The default artwork lives in
 * SmartLinkArtwork.stories.tsx.
 */
const meta = {
  title: 'Release/SmartLinkArtwork/States',
  component: SmartLinkArtwork,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: {
    src: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    alt: 'Never Say A Word artwork',
    title: 'Never Say A Word',
  },
} satisfies Meta<typeof SmartLinkArtwork>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the artwork URL fails to load, so the placeholder glyph shows. */
export const ErrorBrokenArtwork: Story = {
  args: { src: '/missing-smart-link-artwork.jpg' },
};

/** Partial: a release with no artwork and no download sizes yet. */
export const PartialNoArtwork: Story = {
  args: { src: null, artworkSizes: null, allowDownloads: false },
};

/** Long content: a long release title and alt text in the reserved square. */
export const LongContentTitle: Story = {
  args: {
    alt: 'An extended deluxe edition artwork with a very long release title that keeps going',
    title:
      'An Extended Deluxe Edition With A Very Long Release Title That Keeps Going',
    allowDownloads: true,
  },
};

/** Right-to-left: the artwork centred inside an RTL document. */
export const RtlArtwork: Story = {
  args: { alt: 'غلاف الألبوم', title: 'لا تقل كلمة' },
  decorators: [
    function RtlDocument(StoryComponent) {
      return (
        <div dir='rtl' lang='ar'>
          <StoryComponent />
        </div>
      );
    },
  ],
};
