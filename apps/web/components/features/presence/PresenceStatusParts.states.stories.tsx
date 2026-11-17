import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PresenceSignalList, PresenceStatusBadge } from './PresenceStatusParts';

const meta = {
  title: 'Presence/SharedStatus States',
  component: PresenceStatusBadge,
  args: {
    status: {
      label: 'Unconfigured',
      tone: 'neutral',
      needsAttention: true,
      nextAction: 'Connect a source before measuring health.',
      sortPriority: 1,
    },
  },
} satisfies Meta<typeof PresenceStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a signal list with no signals yet. */
export const EmptySignals: Story = {
  render: () => <PresenceSignalList signals={[]} />,
};

/** Error: a failed connection with its next action. */
export const ErrorStatus: Story = {
  args: {
    status: {
      label: 'Disconnected',
      tone: 'error',
      needsAttention: true,
      nextAction: 'Reconnect the account to resume checks.',
      sortPriority: 0,
    },
  },
};

/** Long content: a long status label and long signal copy. */
export const LongContent: Story = {
  render: () => (
    <div className='w-72 space-y-3'>
      <PresenceStatusBadge
        status={{
          label: 'Needs review across every connected profile and link source',
          tone: 'warning',
          needsAttention: true,
          nextAction: 'Review the flagged checks.',
          sortPriority: 2,
        }}
      />
      <PresenceSignalList
        signals={[
          {
            kind: 'recommendation',
            tone: 'warning',
            label:
              'Refresh the artist bio on every platform that still shows the old one',
            detail:
              'Spotify, Apple Music and YouTube still show the bio from the last release cycle; update them so fans read the same story everywhere.',
            sortOrder: 0,
          },
        ]}
      />
    </div>
  ),
};

/** Rtl: Arabic status and signals in a right-to-left document. */
export const Rtl: Story = {
  render: () => (
    <div dir='rtl' lang='ar' className='space-y-3'>
      <PresenceStatusBadge
        status={{
          label: 'متصل',
          tone: 'success',
          needsAttention: false,
          nextAction: 'لا شيء مطلوب.',
          sortPriority: 3,
        }}
      />
      <PresenceSignalList
        signals={[
          {
            kind: 'finding',
            tone: 'neutral',
            label: 'تم الفحص',
            detail: 'كل الروابط تعمل.',
            sortOrder: 0,
          },
        ]}
      />
    </div>
  ),
};
