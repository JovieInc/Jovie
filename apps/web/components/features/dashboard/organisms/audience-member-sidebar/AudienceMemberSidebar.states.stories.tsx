import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ComponentType } from 'react';
import { expect, fn, within } from 'storybook/test';
import type { AudienceMember } from '@/types';
import { AudienceMemberSidebar } from './AudienceMemberSidebar';

const member: AudienceMember = {
  id: 'aud-1',
  type: 'email',
  displayName: 'Avery Stone',
  locationLabel: 'Brooklyn, NY',
  geoCity: 'Brooklyn',
  geoCountry: 'US',
  visits: 8,
  engagementScore: 82,
  intentLevel: 'high',
  latestActions: [
    {
      label: 'profile_view',
      sourceLabel: 'Instagram',
      confidence: 'verified',
      timestamp: '2026-08-31T18:20:00.000Z',
    },
    {
      label: 'link_click',
      sourceLabel: 'Listen Now',
      timestamp: '2026-08-31T17:05:00.000Z',
    },
  ],
  referrerHistory: [],
  utmParams: {},
  email: 'avery@example.com',
  phone: null,
  emailVisibleToArtist: true,
  spotifyConnected: true,
  purchaseCount: 1,
  tipAmountTotalCents: 500,
  tipCount: 1,
  tags: ['superfan'],
  deviceType: 'mobile',
  lastSeenAt: '2026-08-31T18:20:00.000Z',
};

function withRtl(Story: ComponentType) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** State coverage for the audience member drawer. */
const meta = {
  title: 'Features/Dashboard/Audience/AudienceMemberSidebar States',
  component: AudienceMemberSidebar,
  args: { member, isOpen: true, onClose: fn() },
} satisfies Meta<typeof AudienceMemberSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no row is selected yet. */
export const EmptySelection: Story = {
  args: { member: null },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'Select a row in the table to view contact details.'
      )
    ).toBeVisible();
  },
};

/** Long content: a long name, email and location clamp in the header. */
export const LongContentHeader: Story = {
  args: {
    member: {
      ...member,
      displayName: 'Bartholomew Maximilian Montgomery-Fitzgerald the Third',
      email:
        'bartholomew.montgomery.fitzgerald@international-music-collective.example.com',
      locationLabel:
        'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch',
    },
  },
};

/** Right-to-left: the drawer inside an RTL document. */
export const RtlDocument: Story = {
  args: { member: { ...member, displayName: 'سارة المعجبة' } },
  decorators: [withRtl],
};

/** Anonymous visitors use activity as their single header detail. */
export const AnonymousVisitor: Story = {
  args: { member: { ...member, displayName: null, email: null, phone: null } },
};

/** A member without contact or activity data keeps the same avatar footprint. */
export const Sparse: Story = {
  args: {
    member: {
      ...member,
      email: null,
      phone: null,
      locationLabel: '',
      visits: 0,
    },
  },
};
