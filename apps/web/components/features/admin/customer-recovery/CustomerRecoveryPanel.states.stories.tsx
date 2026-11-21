import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CustomerRecoveryResult } from '@/lib/admin/customer-recovery';
import { CustomerRecoveryPanel } from './CustomerRecoveryPanel';

const empty: CustomerRecoveryResult = {
  search: '',
  matches: [],
  dossier: null,
  error: null,
  generatedAt: '2026-10-02T12:00:00.000Z',
};

const meta = {
  title: 'Features/Admin/CustomerRecovery/CustomerRecoveryPanel/States',
  component: CustomerRecoveryPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-screen bg-surface-0 p-6 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { result: empty },
} satisfies Meta<typeof CustomerRecoveryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no search yet, so only the form and snapshot note show. */
export const EmptyNoSearch: Story = {};

/** Error: the evidence read failed and the panel says so. */
export const ErrorUnavailable: Story = {
  args: { result: { ...empty, search: 'phoebe', error: 'unavailable' } },
};

/** Long content: a very long identifier and several long match labels. */
export const LongContent: Story = {
  args: {
    result: {
      ...empty,
      search:
        'a.very.long.customer.identifier.that.keeps.going@example-label-with-a-long-domain.com',
      matches: [
        {
          dedupeKey: 'user:long1',
          displayName:
            'A Customer With A Very Long Display Name That Goes Past The Column',
          email: 'a.very.long.customer.identifier@example-label-domain.com',
          handle: 'a-very-long-handle-for-overflow-checks',
          stage: 'claimed',
        },
        {
          dedupeKey: 'lead:long2',
          displayName: null,
          email: null,
          handle: null,
          stage: 'suggested',
        },
      ],
    },
  },
};

/** Offline: the read failed because the network was down. */
export const OfflineUnavailable: Story = {
  args: { result: { ...empty, search: 'phoebe', error: 'unavailable' } },
};

/** Rtl: right-to-left layout keeps the search row aligned. */
export const RtlOverflow: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
