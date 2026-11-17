import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileCaptureSection } from './ArtistProfileCaptureSection';

const CAPTURE = ARTIST_PROFILE_COPY.capture;

/** Rendered states of the capture section; defaults live in ArtistProfileCaptureSection.stories.tsx. */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileCaptureSection States',
  component: ArtistProfileCaptureSection,
  parameters: { layout: 'fullscreen' },
  args: { capture: CAPTURE },
} satisfies Meta<typeof ArtistProfileCaptureSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long headline and body beside the editorial demo. */
export const LongContentEditorial: Story = {
  args: {
    id: 'capture-long',
    capture: {
      ...CAPTURE,
      headline:
        'Capture every listener who opens your profile, for every release and every nearby show',
      body: 'Jovie turns each opt-in into a listener you can reach for the next release, the next nearby show and every moment after it, without a list to export or a campaign to write.',
    },
  },
};

/** Right-to-left: Arabic capture copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    capture: {
      ...CAPTURE,
      headline: 'التقط كل مستمع.',
      body: 'يحول جوفي كل اشتراك إلى مستمع يمكنك الوصول إليه.',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
