import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_SOCIAL_PROOF,
  type ArtistProfileSocialProofData,
} from '@/data/socialProof';
import { ArtistProfileSocialProof } from './ArtistProfileSocialProof';

const FOUNDER = ARTIST_PROFILE_SOCIAL_PROOF.founderQuote;

// The same founder-quote fixture the base stories use, in the gate's shape.
const VERIFIED_PROOF: ArtistProfileSocialProofData = {
  ...ARTIST_PROFILE_SOCIAL_PROOF,
  quotes: FOUNDER
    ? [
        {
          id: 'founder',
          name: FOUNDER.name,
          role: FOUNDER.role,
          quote: FOUNDER.quote,
        },
      ]
    : [],
  hasRealQuotes: true,
};

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileSocialProof States',
  component: ArtistProfileSocialProof,
  parameters: { layout: 'fullscreen' },
  args: {
    socialProof: ARTIST_PROFILE_COPY.socialProof,
    proofData: VERIFIED_PROOF,
  },
} satisfies Meta<typeof ArtistProfileSocialProof>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the production gate is closed, so the section renders nothing. */
export const EmptyGateClosed: Story = {
  args: {
    proofData: { ...ARTIST_PROFILE_SOCIAL_PROOF, hasRealQuotes: false },
  },
};

/** Empty: the gate is open but no quote is supplied; only the header shows. */
export const EmptyQuoteList: Story = {
  args: { proofData: { ...VERIFIED_PROOF, quotes: [] } },
};

/** Long content: three long quotes with long names and roles wrap per column. */
export const LongContentQuotes: Story = {
  args: {
    proofData: {
      ...VERIFIED_PROOF,
      quotes: [1, 2, 3].map(index => ({
        id: `long-${index}`,
        name: `${FOUNDER?.name ?? 'Artist'} and the full touring team, part ${index}`,
        role: 'Founder, producer, touring DJ and label partner',
        quote: `${FOUNDER?.quote ?? ''} ${FOUNDER?.quote ?? ''}`,
      })),
    },
  },
};

/** Right-to-left: Arabic header and quote in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    socialProof: {
      headline: 'مصمم لسير عمل الفنانين الحقيقي.',
      intro: 'قصص فنانين موثقة عند توفرها.',
    },
    proofData: {
      ...VERIFIED_PROOF,
      quotes: [
        {
          id: 'rtl',
          name: 'تيم وايت',
          role: 'المؤسس',
          quote: 'بنينا هذه الأداة لأننا تعبنا من أدوات لم تصنع للموسيقى.',
        },
      ],
    },
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
