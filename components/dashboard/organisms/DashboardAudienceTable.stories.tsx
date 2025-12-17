import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { DashboardDataProvider } from '@/app/app/dashboard/DashboardDataContext';
import DashboardLayoutClient from '@/app/app/dashboard/DashboardLayoutClient';
import type { DashboardData } from '@/app/app/dashboard/actions';
import type { AudienceMember } from '@/types';
import { DashboardAudienceTable } from './DashboardAudienceTable';

const mockDashboardData: DashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
};

const mockMembers: AudienceMember[] = [
  {
    id: 'aud-1',
    type: 'email',
    displayName: 'Sasha Fan',
    locationLabel: 'Los Angeles, US',
    geoCity: 'Los Angeles',
    geoCountry: 'US',
    visits: 12,
    engagementScore: 87,
    intentLevel: 'high',
    latestActions: [
      { label: 'Visited profile', timestamp: new Date().toISOString() },
      { label: 'Clicked link', timestamp: new Date().toISOString() },
      { label: 'Subscribed', timestamp: new Date().toISOString() },
    ],
    referrerHistory: [
      { url: 'https://instagram.com', timestamp: new Date().toISOString() },
      { url: 'https://tiktok.com', timestamp: new Date().toISOString() },
    ],
    email: 'sasha@example.com',
    phone: null,
    spotifyConnected: false,
    purchaseCount: 0,
    tags: ['superfan'],
    deviceType: 'mobile',
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: 'aud-2',
    type: 'anonymous',
    displayName: null,
    locationLabel: 'Unknown',
    geoCity: null,
    geoCountry: null,
    visits: 3,
    engagementScore: 22,
    intentLevel: 'low',
    latestActions: [
      { label: 'Visited profile', timestamp: new Date().toISOString() },
    ],
    referrerHistory: [],
    email: null,
    phone: null,
    spotifyConnected: false,
    purchaseCount: 0,
    tags: [],
    deviceType: 'desktop',
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: 'aud-3',
    type: 'sms',
    displayName: 'Text Fan',
    locationLabel: 'Austin, US',
    geoCity: 'Austin',
    geoCountry: 'US',
    visits: 7,
    engagementScore: 55,
    intentLevel: 'medium',
    latestActions: [
      { label: 'Subscribed', timestamp: new Date().toISOString() },
      { label: 'Visited profile', timestamp: new Date().toISOString() },
    ],
    referrerHistory: [
      { url: 'https://youtube.com', timestamp: new Date().toISOString() },
    ],
    email: null,
    phone: '+15555555555',
    spotifyConnected: false,
    purchaseCount: 0,
    tags: ['sms'],
    deviceType: 'mobile',
    lastSeenAt: new Date().toISOString(),
  },
];

const meta: Meta<typeof DashboardAudienceTable> = {
  title: 'Dashboard/Organisms/DashboardAudienceTable',
  component: DashboardAudienceTable,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0D0E12' },
      ],
    },
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
    },
  },
  tags: ['autodocs', 'audience-a11y'],
  decorators: [
    Story => (
      <DashboardDataProvider value={mockDashboardData}>
        <DashboardLayoutClient dashboardData={mockDashboardData}>
          <div className='h-[720px] bg-surface-1 text-primary-token'>
            <Story />
          </div>
        </DashboardLayoutClient>
      </DashboardDataProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const MembersLight: Story = {
  args: {
    mode: 'members',
    rows: mockMembers,
    total: 42,
    page: 1,
    pageSize: 10,
    sort: 'lastSeen',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

export const MembersDark: Story = {
  args: {
    mode: 'members',
    rows: mockMembers,
    total: 42,
    page: 1,
    pageSize: 10,
    sort: 'lastSeen',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const SubscribersLight: Story = {
  args: {
    mode: 'subscribers',
    rows: mockMembers.map(member => ({
      ...member,
      type: member.email ? 'email' : 'sms',
    })),
    total: 12,
    page: 1,
    pageSize: 10,
    sort: 'createdAt',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
  },
  parameters: {
    backgrounds: { default: 'light' },
  },
};

export const SubscribersDark: Story = {
  args: {
    mode: 'subscribers',
    rows: mockMembers.map(member => ({
      ...member,
      type: member.email ? 'email' : 'sms',
    })),
    total: 12,
    page: 1,
    pageSize: 10,
    sort: 'createdAt',
    direction: 'desc',
    onPageChange: () => {},
    onPageSizeChange: () => {},
    onSortChange: () => {},
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
