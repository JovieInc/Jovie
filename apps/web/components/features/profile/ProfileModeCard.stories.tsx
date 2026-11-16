import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { resolveProfileModeCardAccents } from '@/lib/profile/mode-card-accent';
import { ProfileModeCard, ProfileModeCardAction } from './ProfileModeCard';

const ACCENTS = resolveProfileModeCardAccents({ listenArtworkAccent: 'ultra' });

const meta = {
  title: 'Profile/ProfileModeCard',
  component: ProfileModeCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-sm max-w-full bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    accent: ACCENTS.events,
    eyebrow: 'Events',
    title: 'No upcoming events',
    description: 'New dates will appear here.',
  },
} satisfies Meta<typeof ProfileModeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EventsEmpty: Story = {};

export const WithAction: Story = {
  args: {
    accent: ACCENTS['stay-close'],
    eyebrow: 'Stay close',
    title: 'Stay in touch',
    description: 'Notes from Tim White, straight to your inbox.',
    eyebrowAside: null,
    ariaLabel: 'Stay close',
    className: undefined,
    dataTestId: 'profile-mode-card-story',
    media: null,
    children: (
      <ProfileModeCardAction href='/timwhite/alerts'>
        Get alerts
      </ProfileModeCardAction>
    ),
  },
};

/** Eyebrow only: no title, description, media or actions have loaded. */
export const EmptyEyebrowOnly: Story = {
  args: {
    accent: ACCENTS.events,
    eyebrow: 'Events',
    title: undefined,
    description: undefined,
  },
};

/** A title with no description or action: the reserved height holds. */
export const PartialTitleOnly: Story = {
  args: {
    accent: ACCENTS.listen,
    eyebrow: 'Listen',
    title: 'Never Say A Word',
    description: undefined,
  },
};

export const LongContentTruncates: Story = {
  args: {
    accent: ACCENTS['stay-close'],
    eyebrow:
      'Stay close with weekly notes, tour dates and early releases from the studio',
    title:
      'Stay in touch with Tim White and the whole Never Say A Word touring band',
    description:
      'Notes from Tim White, straight to your inbox: new music the moment it lands, tour dates near you before they go on sale, and the occasional voice memo from the studio. Unsubscribe whenever you like.',
    children: (
      <ProfileModeCardAction href='/timwhite/alerts'>
        Get alerts for new music, tour dates and studio notes
      </ProfileModeCardAction>
    ),
  },
};

export const RtlCard: Story = {
  args: {
    accent: ACCENTS['stay-close'],
    eyebrow: 'ابق على تواصل',
    title: 'ابق على اتصال مع تيم وايت',
    description: 'ملاحظات من تيم وايت مباشرة إلى بريدك الوارد.',
    children: (
      <ProfileModeCardAction href='/timwhite/alerts'>
        احصل على التنبيهات
      </ProfileModeCardAction>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
