import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileFinalCta } from './ArtistProfileFinalCta';

const FINAL = ARTIST_PROFILE_COPY.finalCta;

/** Rendered states of the final CTA; the default lives in ArtistProfileFinalCta.stories.tsx. */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileFinalCta States',
  component: ArtistProfileFinalCta,
  parameters: { layout: 'fullscreen' },
  args: { finalCta: FINAL },
} satisfies Meta<typeof ArtistProfileFinalCta>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long headline and action label. */
export const LongContentHeadline: Story = {
  args: {
    finalCta: {
      ...FINAL,
      headline:
        'Claim the profile that keeps every release, show and listener in one place, and let it adapt for you',
      ctaLabel: 'Claim your free artist profile today',
    },
  },
};

/** Right-to-left: Arabic CTA copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    finalCta: { ...FINAL, headline: 'احجز ملفك الفني.', ctaLabel: 'احجز ملفك' },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
