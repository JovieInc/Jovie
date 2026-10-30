import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileMediaCard } from './ProfileMediaCard';

const meta = {
  title: 'Profile/ProfileMediaCard',
  component: ProfileMediaCard,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: ['compact'],
    },
  },
  args: {
    eyebrow: 'New release',
    title: 'The Deep End',
    subtitle: 'Release plan, profile, and fan alert are ready.',
    imageUrl: '/images/avatars/tim-white.jpg',
    imageAlt: 'The Deep End artwork',
    fallbackVariant: 'release',
    accent: 'purple',
    ratio: 'portrait',
    countdown: {
      targetDate: '2026-09-04T16:00:00.000Z',
      now: new Date('2026-09-03T16:00:00.000Z'),
      label: 'Launches in',
    },
    datePill: {
      month: 'SEP',
      day: '04',
      meta: 'Single',
    },
    status: {
      label: 'Almost gone',
      tone: 'orange',
    },
    action: {
      label: 'Listen now',
      href: '/timwhite/the-deep-end',
      icon: 'Play',
      showChevron: true,
      external: false,
      disabled: false,
    },
    secondaryAction: {
      label: 'Get alerts',
      href: '/timwhite?subscribe=1',
      icon: 'Bell',
      external: false,
    },
    priority: true,
    dataTestId: 'profile-media-card-story',
  },
} satisfies Meta<typeof ProfileMediaCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Release: Story = {};

export const Landscape: Story = {
  args: {
    ratio: 'landscape',
    locationLabel: 'Brooklyn, NY',
    secondaryLocationLabel: 'Brooklyn Steel',
  },
};
