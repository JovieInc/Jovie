import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ARTIST_NOTIFICATIONS_COPY,
  type ArtistNotificationsLandingCopy,
} from '@/data/artistNotificationsCopy';
import { ArtistNotificationsLanding } from './ArtistNotificationsLanding';

const RtlCanvas: Decorator = function RtlCanvas(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const LONG_COPY: ArtistNotificationsLandingCopy = {
  ...ARTIST_NOTIFICATIONS_COPY,
  hero: {
    ...ARTIST_NOTIFICATIONS_COPY.hero,
    headline:
      'Reach every listener who ever opted in, on every release, tour date and drop, on autopilot.',
    headlineLines: [
      'Reach every listener who ever opted in,',
      'on every release, tour date and drop, on autopilot.',
    ],
    primaryCtaLabel: 'Claim your page and turn on release alerts',
  },
};

const RTL_COPY: ArtistNotificationsLandingCopy = {
  ...ARTIST_NOTIFICATIONS_COPY,
  hero: {
    ...ARTIST_NOTIFICATIONS_COPY.hero,
    headline: 'تواصل مع المستمعين. تلقائيًا.',
    headlineLines: ['تواصل مع المستمعين.', 'تلقائيًا.'],
    primaryCtaLabel: 'احجز صفحتك',
  },
};

/**
 * Rendered states of the /artist-notifications composition. The production
 * landing story lives in ArtistNotificationsLanding.stories.tsx.
 */
const meta = {
  title: 'Marketing/Artist Notifications/ArtistNotificationsLanding/States',
  component: ArtistNotificationsLanding,
  parameters: { layout: 'fullscreen' },
  args: { copy: ARTIST_NOTIFICATIONS_COPY },
} satisfies Meta<typeof ArtistNotificationsLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a hero headline and action label that wrap. */
export const LongContentHero: Story = {
  args: { copy: LONG_COPY },
};

/** Right-to-left: Arabic hero copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: { copy: RTL_COPY },
  decorators: [RtlCanvas],
};
