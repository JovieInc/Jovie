import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileOutcomesCarousel } from './ArtistProfileOutcomesCarousel';

const OUTCOMES = ARTIST_PROFILE_COPY.outcomes;

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileOutcomesCarousel States',
  component: ArtistProfileOutcomesCarousel,
  parameters: { layout: 'fullscreen' },
  args: { outcomes: OUTCOMES },
} satisfies Meta<typeof ArtistProfileOutcomesCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no landing cards, so only the section header remains. */
export const EmptyLedger: Story = {
  args: { outcomes: { ...OUTCOMES, landingCards: [] } },
};

/** Long content: a long headline, body and card copy wrap inside the ledger. */
export const LongContentLedger: Story = {
  args: {
    outcomes: {
      ...OUTCOMES,
      headline:
        'Built around the audience outcomes that matter on release day, on tour and every quiet week between them.',
      body: `${OUTCOMES.body} ${OUTCOMES.body}`,
      landingCards: OUTCOMES.landingCards.map(card => ({
        ...card,
        description: `${card.description} ${card.description}`,
      })),
    },
  },
};

/** Right-to-left: Arabic headline and card copy in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    outcomes: {
      ...OUTCOMES,
      headline: 'مبني حول نتائج الجمهور.',
      body: 'كل زائر يصل إلى الخطوة الصحيحة من ملف واحد.',
      landingCards: OUTCOMES.landingCards.map(card => ({
        ...card,
        title: 'الاستماع أولاً',
        description: 'يصل المستمع مباشرة إلى المنصة التي يفضلها.',
      })),
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
