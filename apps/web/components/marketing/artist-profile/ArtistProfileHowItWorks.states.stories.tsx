import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileHowItWorks } from './ArtistProfileHowItWorks';

const HOW = ARTIST_PROFILE_COPY.howItWorks;

/** Rendered states of the setup section; the default lives in ArtistProfileHowItWorks.stories.tsx. */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileHowItWorks States',
  component: ArtistProfileHowItWorks,
  parameters: { layout: 'fullscreen' },
  args: { howItWorks: HOW },
} satisfies Meta<typeof ArtistProfileHowItWorks>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the header and product window with no written steps. */
export const EmptySteps: Story = {
  args: { howItWorks: { ...HOW, steps: [] } },
};

/** Long content: a long header and long step copy. */
export const LongContentSteps: Story = {
  args: {
    howItWorks: {
      ...HOW,
      headline:
        'One link, three steps, and a profile that keeps itself current',
      body: 'Claim your artist name, connect your catalog and every listening service, then share one Jovie link everywhere you already post, from bios to QR codes at shows.',
      steps: HOW.steps.map(step => ({
        ...step,
        description: `${step.description} This step carries extra words so it wraps across several lines in the narrow column.`,
      })),
    },
  },
};

/** Right-to-left: Arabic setup copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    howItWorks: {
      ...HOW,
      headline: 'رابط واحد. ثلاث خطوات.',
      body: 'احجز اسمك واربط كتالوجك وشارك رابطًا واحدًا.',
      steps: [
        { id: 'claim', title: 'احجز ملفك.', description: 'ابدأ باسمك.' },
        { id: 'share', title: 'شارك الرابط.', description: 'في كل مكان.' },
      ],
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
