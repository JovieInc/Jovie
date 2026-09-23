import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ShareContext } from '@/lib/share/types';
import { mockArtist } from '@/lib/test-utils/mock-data';
import { ProfileUnifiedDrawer } from './ProfileUnifiedDrawer';

const meta = {
  title: 'Profile/ProfileUnifiedDrawer',
  component: ProfileUnifiedDrawer,
  args: {
    open: true,
    onOpenChange: fn(),
    view: 'pay',
    onViewChange: fn(),
    artist: mockArtist,
    socialLinks: [
      { platform: 'venmo', url: 'https://venmo.com/demo' } as never,
    ],
    contacts: [],
    primaryChannel: () => ({}) as never,
    dsps: [],
    isSubscribed: false,
    contentPrefs: {} as never,
    onTogglePref: fn(),
    onUnsubscribe: fn(),
    isUnsubscribing: false,
    shareContext: {} as ShareContext,
    hasTip: true,
    hasContacts: false,
    hasTourDates: false,
    hasReleases: false,
  },
} satisfies Meta<typeof ProfileUnifiedDrawer>;

export default meta;
export const PayNow: StoryObj<typeof meta> = {};
