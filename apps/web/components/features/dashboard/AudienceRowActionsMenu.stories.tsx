import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { AudienceMember } from '@/types';
import { AudienceRowActionsMenu } from './AudienceRowActionsMenu';

const member = {
  id: 'member-1',
  type: 'email',
  displayName: 'Ada',
  locationLabel: 'Unknown',
  geoCity: null,
  geoCountry: null,
  visits: 1,
  engagementScore: 0,
  intentLevel: 'low',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: 'ada@example.com',
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: null,
  lastSeenAt: null,
} satisfies Partial<AudienceMember>;

const meta = {
  title: 'Dashboard/AudienceRowActionsMenu',
  component: AudienceRowActionsMenu,
  parameters: {
    layout: 'centered',
  },
  args: {
    row: member as AudienceMember,
    open: true,
    // `modal={false}`: a modal Radix menu `hideOthers`-ARIA-hides the story
    // canvas around the portaled content, which fails axe aria-hidden-focus
    // on the focusable trigger. Non-modal is visually identical for demos.
    modal: false,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof AudienceRowActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: {
    open: false,
  },
};
