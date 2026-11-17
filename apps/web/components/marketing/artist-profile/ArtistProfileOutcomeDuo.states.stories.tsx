import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ArtistProfileOutcomeDuo,
  type ArtistProfileOutcomeDuoCopy,
} from './ArtistProfileOutcomeDuo';

const DUO = ARTIST_PROFILE_COPY.outcomeDuo;

const OutcomeDuoCanvas: Decorator = function OutcomeDuoCanvas(Story) {
  return (
    <div className='bg-base text-primary-token'>
      <Story />
    </div>
  );
};

const RtlCanvas: Decorator = function RtlCanvas(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const EMPTY_DUO: ArtistProfileOutcomeDuoCopy = {
  ...DUO,
  cards: {
    getPaid: { ...DUO.cards.getPaid, amountRows: [] },
    sellOut: { ...DUO.cards.sellOut, drawerRows: [] },
  },
};

const LONG_DUO: ArtistProfileOutcomeDuoCopy = {
  ...DUO,
  cards: {
    getPaid: {
      ...DUO.cards.getPaid,
      label: 'Get paid directly by the fans who show up for every release',
      ctaLabel: 'Continue with Venmo, Cash App or a card on file',
    },
    sellOut: {
      ...DUO.cards.sellOut,
      label: 'Sell out every room on the tour, city by city',
      drawerRows: DUO.cards.sellOut.drawerRows.map(row => ({
        ...row,
        venue: `${row.venue} Grand Ballroom and Outdoor Amphitheater`,
        location: `${row.location}, United States of America`,
      })),
    },
  },
};

const RTL_DUO: ArtistProfileOutcomeDuoCopy = {
  ...DUO,
  cards: {
    getPaid: {
      ...DUO.cards.getPaid,
      label: 'احصل على أجرك',
      drawerTitle: 'الدفع',
      ctaLabel: 'تابع عبر Venmo',
    },
    sellOut: {
      ...DUO.cards.sellOut,
      label: 'بيع كل التذاكر',
      drawerTitle: 'مواعيد الجولة',
      drawerRows: DUO.cards.sellOut.drawerRows.map(row => ({
        ...row,
        ctaLabel: 'التذاكر',
      })),
    },
  },
};

/**
 * Rendered states of the outcome duo. The production marketing and homepage
 * stories live in ArtistProfileOutcomeDuo.stories.tsx.
 */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileOutcomeDuo/States',
  component: ArtistProfileOutcomeDuo,
  parameters: { layout: 'fullscreen' },
  decorators: [OutcomeDuoCanvas],
  args: {
    headline: DUO.marketingHeadline,
    duo: DUO,
  },
} satisfies Meta<typeof ArtistProfileOutcomeDuo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: both drawers with no amount rows and no tour dates. */
export const EmptyDrawers: Story = {
  args: { duo: EMPTY_DUO },
};

/** Long content: long labels, venues and locations that truncate per row. */
export const LongContentLabels: Story = {
  args: {
    headline:
      'Artist Profiles. Built to convert every visit into a fan who pays, comes to the show and stays for the next release.',
    duo: LONG_DUO,
  },
};

/** Right-to-left: Arabic labels in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    headline: 'ملفات الفنانين. مصممة للتحويل.',
    duo: RTL_DUO,
  },
  decorators: [RtlCanvas],
};
