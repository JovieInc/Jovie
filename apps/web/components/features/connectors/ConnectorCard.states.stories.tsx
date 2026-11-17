import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { GOOGLE_OAUTH_SCOPE } from '@/lib/connectors/registry';
import { ConnectorCard } from './ConnectorCard';

/**
 * State coverage for one connector row. The full status matrix stays in
 * ConnectorCard.stories.tsx; each story here isolates one state through props.
 */
const meta: Meta<typeof ConnectorCard> = {
  title: 'Features/Connectors/ConnectorCard States',
  component: ConnectorCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    provider: 'gmail',
    status: 'not_connected',
    onConnect: fn(),
    onDisconnect: fn(),
  },
  decorators: [
    Story => (
      <div className='w-full max-w-2xl rounded-lg bg-surface-1 px-4'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ConnectorCard>;

/** Loading: a connect request is in flight. */
export const LoadingConnecting: Story = {
  args: { pending: true, pendingAction: 'connect' },
};

/** Loading: a connected account mid-sync. */
export const LoadingSyncing: Story = {
  args: { status: 'syncing', accountLabel: 'artist@example.com' },
};

/** Empty: connected, but no permission has been confirmed yet. */
export const EmptyNoPermissions: Story = {
  args: { status: 'connected', accountLabel: 'artist@example.com', scopes: [] },
};

/** Error: the provider rejected the connection. */
export const ErrorConnectionFailed: Story = {
  args: {
    status: 'error',
    accountLabel: 'artist@example.com',
    errorMessage: 'Google rejected the connection.',
  },
};

/** Partial: connected with only some of the permissions granted. */
export const PartialMissingPermissions: Story = {
  args: {
    provider: 'google_calendar',
    status: 'connected',
    accountLabel: 'artist@example.com',
    scopes: [GOOGLE_OAUTH_SCOPE.calendarEventsReadonly],
    lastSyncAt: '2026-11-10T18:30:00.000Z',
  },
};

/** Long content: a long account and a long error wrap inside the row. */
export const LongContentAccountAndError: Story = {
  args: {
    status: 'error',
    accountLabel:
      'bookings-and-management-for-the-artist-collective@example-label-records.com',
    errorMessage:
      'Google rejected the connection because the account administrator has not approved third-party access for this workspace. Ask them to allow Jovie, then try again.',
  },
};

/** Offline: connections cannot be read without a network. */
export const OfflineUnavailable: Story = {
  args: {
    status: 'unavailable',
    available: false,
    unavailableReason:
      'You are offline. Connections will load when you are back online.',
  },
};

/** Permission denied: the provider revoked access and needs a reconnect. */
export const PermissionDeniedReauth: Story = {
  args: {
    status: 'needs_reauth',
    accountLabel: 'artist@example.com',
    errorMessage: 'Google access expired. Reconnect to continue.',
  },
};

/** Right-to-left: a connected row inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    status: 'connected',
    accountLabel: 'artist@example.com',
    scopes: [GOOGLE_OAUTH_SCOPE.gmailReadonly],
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
