import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import {
  createDashboardQueryClient,
  DashboardStoryProviders,
} from '@/.storybook/dashboard-fixtures';
import { queryKeys } from '@/lib/queries/keys';
import { SettingsTouringSection } from './SettingsTouringSection';

const PROFILE_ID = 'story-profile';

const CONNECTED = {
  connected: true,
  artistName: 'Sasha Waves',
  lastSyncedAt: '2026-10-14T00:00:00.000Z',
  hasApiKey: true,
};

const LONG_NAME = {
  connected: true,
  artistName:
    'An Extremely Long Artist Name That Has To Truncate Inside The Connection Pill',
  lastSyncedAt: '2026-10-14T00:00:00.000Z',
  hasApiKey: true,
};

const NOT_CONNECTED = {
  connected: false,
  artistName: null,
  lastSyncedAt: null,
  hasApiKey: false,
};

function withConnection(connection: object, dir: 'ltr' | 'rtl' = 'ltr') {
  return function ConnectionDecorator(Story: () => ReactNode) {
    const client = createDashboardQueryClient();
    client.setQueryData(queryKeys.tourDates.connection(PROFILE_ID), connection);
    return (
      <DashboardStoryProviders queryClient={client}>
        <div dir={dir} className='w-2xl max-w-full'>
          <Story />
        </div>
      </DashboardStoryProviders>
    );
  };
}

const meta = {
  title: 'Dashboard/Organisms/SettingsTouringSection States',
  component: SettingsTouringSection,
  parameters: { layout: 'padded' },
  args: { profileId: PROFILE_ID },
} satisfies Meta<typeof SettingsTouringSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { decorators: [withConnection(NOT_CONNECTED)] };

export const Partial: Story = { decorators: [withConnection(CONNECTED)] };

export const LongContent: Story = { decorators: [withConnection(LONG_NAME)] };

export const Rtl: Story = { decorators: [withConnection(CONNECTED, 'rtl')] };
