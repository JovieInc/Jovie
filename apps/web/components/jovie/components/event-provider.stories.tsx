import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { EventRecord } from '@/lib/queries/useEventsQuery';
import { createEventProvider } from './event-provider';

const mockEvents: EventRecord[] = [
  {
    id: 'evt_1',
    title: 'Brooklyn, NY',
    subtitle: 'Brooklyn, NY · Bandsintown',
    eventDate: '2026-11-14T20:00:00.000Z',
    timezone: 'America/New_York',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    providerKey: 'bandsintown',
    reviewedAt: null,
    lastSyncedAt: null,
    venue: 'Elsewhere',
    city: 'Brooklyn, NY',
    provider: 'Bandsintown',
  },
] as unknown as EventRecord[];

function EventProviderDemo({ query }: { readonly query: string }) {
  const provider = createEventProvider('profile-1');
  const { items, isLoading } = provider.useSearch(query);

  return (
    <div className='w-72 space-y-2'>
      {isLoading ? (
        <p className='text-sm text-secondary-token'>Loading…</p>
      ) : (
        items.map(item => <div key={item.id}>{provider.renderChip(item)}</div>)
      )}
    </div>
  );
}

function QueryProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.events.list('profile-1'), mockEvents);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Jovie/EventProvider',
  component: EventProviderDemo,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <QueryProvider>
        <div className='bg-base p-3'>
          <Story />
        </div>
      </QueryProvider>
    ),
  ],
  args: {
    query: '',
  },
} satisfies Meta<typeof EventProviderDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllEvents: Story = {};

export const FilteredByQuery: Story = {
  args: {
    query: 'brooklyn',
  },
};
