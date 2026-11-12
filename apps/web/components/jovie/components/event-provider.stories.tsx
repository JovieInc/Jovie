import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { expect, within } from 'storybook/test';
import { queryKeys } from '@/lib/queries/keys';
import type { EventRecord } from '@/lib/queries/useEventsQuery';
import { createEventProvider } from './event-provider';

const PROFILE_ID = 'profile-1';

function eventFixture(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
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
    ...overrides,
  } as EventRecord;
}

const mockEvents: EventRecord[] = [eventFixture()];

const manyLongEvents: EventRecord[] = Array.from({ length: 12 }, (_, index) =>
  eventFixture({
    id: `evt_long_${index}`,
    title: `An unusually long festival stage and venue name, night ${index + 1}`,
  })
);

const rtlEvents: EventRecord[] = [
  eventFixture({
    id: 'evt_rtl',
    title: 'مسرح المدينة الكبير في دبي للموسيقى الإلكترونية',
    city: 'دبي',
  }),
];

/**
 * How the events read resolves in a story. `cached` seeds the query; the
 * Storybook tour-dates action mock answers an empty list otherwise.
 * `pending` holds the first read in flight; `offline` pauses it.
 */
type EventsFixture =
  | { readonly mode: 'cached'; readonly events: EventRecord[] }
  | { readonly mode: 'pending' }
  | { readonly mode: 'offline' };

function EventProviderDemo({ query }: { readonly query: string }) {
  const provider = createEventProvider(PROFILE_ID);
  const { items, isLoading } = provider.useSearch(query);

  return (
    <div className='w-72 space-y-2'>
      {isLoading ? (
        <p className='text-sm text-secondary-token' role='status'>
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className='text-sm text-secondary-token'>No matching events</p>
      ) : (
        items.map(item => <div key={item.id}>{provider.renderChip(item)}</div>)
      )}
    </div>
  );
}

function QueryProvider({
  children,
  fixture,
}: {
  readonly children: ReactNode;
  readonly fixture: EventsFixture;
}) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const key = queryKeys.events.list(PROFILE_ID);
    if (fixture.mode === 'cached') client.setQueryData(key, fixture.events);
    // Starts the first read and never settles, so useEventsQuery joins an
    // in-flight request instead of calling the action mock.
    if (fixture.mode === 'pending')
      void client.prefetchQuery({
        queryKey: key,
        queryFn: () => new Promise<EventRecord[]>(() => {}),
      });
    return client;
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const withEventsFixture: Decorator = (Story, context) => (
  <QueryProvider
    fixture={
      (context.parameters.eventsFixture as EventsFixture | undefined) ?? {
        mode: 'cached',
        events: mockEvents,
      }
    }
  >
    <div className='bg-base p-3' dir={context.parameters.dir as string}>
      <Story />
    </div>
  </QueryProvider>
);

const meta = {
  title: 'Jovie/EventProvider',
  component: EventProviderDemo,
  parameters: {
    layout: 'centered',
  },
  decorators: [withEventsFixture],
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

export const LoadingEvents: Story = {
  parameters: { eventsFixture: { mode: 'pending' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'Loading'
    );
  },
};

export const EmptyNoEvents: Story = {
  parameters: { eventsFixture: { mode: 'cached', events: [] } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('No matching events')
    ).toBeVisible();
  },
};

export const LongEventList: Story = {
  parameters: { eventsFixture: { mode: 'cached', events: manyLongEvents } },
  play: async ({ canvasElement }) => {
    // The provider caps the picker at eight rows.
    await expect(
      within(canvasElement).getAllByTestId('entity-chip')
    ).toHaveLength(8);
  },
};

/** The events read pauses while the browser reports no connection. */
export const OfflineEvents: Story = {
  parameters: { eventsFixture: { mode: 'offline' } },
  beforeEach: () => {
    onlineManager.setOnline(false);
    return () => {
      onlineManager.setOnline(true);
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('status')).toBeNull();
    await expect(canvas.getByText('No matching events')).toBeVisible();
  },
};

export const RtlEventNames: Story = {
  args: { query: 'دبي' },
  parameters: {
    dir: 'rtl',
    eventsFixture: { mode: 'cached', events: rtlEvents },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('entity-chip')
    ).toHaveTextContent('مسرح المدينة');
  },
};
