import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ArtistNotificationsHero } from './ArtistNotificationsHero';

const HERO = ARTIST_NOTIFICATIONS_COPY.hero;

/** Rendered states of the notifications hero; the default lives in ArtistNotificationsHero.stories.tsx. */
const meta = {
  title: 'Marketing/Artist Notifications/ArtistNotificationsHero States',
  component: ArtistNotificationsHero,
  parameters: { layout: 'fullscreen' },
  args: { hero: HERO },
} satisfies Meta<typeof ArtistNotificationsHero>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the hero copy and action with no floating activity cards. */
export const EmptyCardStage: Story = {
  args: { hero: { ...HERO, floatingCards: [] } },
};

/** Long content: a single long headline, a long subhead and long card copy. */
export const LongContentHeadline: Story = {
  args: {
    hero: {
      headline:
        'Reach every listener who ever opened your profile, on autopilot, for every release and every show',
      subhead:
        'Jovie notices new music and nearby shows and tells the fans who asked to hear about them, without a campaign to write or a list to export.',
      primaryCtaLabel: 'Claim your page and turn on notifications',
      primaryCtaHref: HERO.primaryCtaHref,
      floatingCards: HERO.floatingCards.map(card => ({
        ...card,
        title: `${card.title} This example card carries extra words so it wraps.`,
      })),
    },
  },
};

/** Right-to-left: Arabic hero copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    hero: {
      headline: 'تصل إلى المستمعين. تلقائيًا.',
      headlineLines: ['تصل إلى المستمعين.', 'تلقائيًا.'],
      subhead: 'إشعارات للموسيقى الجديدة والحفلات القريبة.',
      primaryCtaLabel: 'احجز صفحتك',
      primaryCtaHref: HERO.primaryCtaHref,
      floatingCards: [
        { id: 'capture', kind: 'capture', title: 'اشترك أحد المعجبين.' },
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
