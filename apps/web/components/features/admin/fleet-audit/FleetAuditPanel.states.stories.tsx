import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { FleetAuditPanel } from './FleetAuditPanel';
import {
  fleetEvent,
  fleetSummary,
  fleetUnattributed,
} from './fleetAudit.test-fixtures';

type SearchRespond = () => Promise<Response>;

const SEARCH_ROUTE = '/api/ovie/fleet-audit';

/**
 * Answers the fleet audit search route for one story and restores the real
 * fetch when the story unmounts. Every other request goes to the real fetch.
 */
function SearchRouteFixture({
  respond,
  children,
}: Readonly<{ respond: SearchRespond; children: ReactNode }>) {
  const [restore] = useState(() => {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(SEARCH_ROUTE)) return respond();
      return original(input, init);
    }) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  });
  useEffect(() => restore, [restore]);
  return <>{children}</>;
}

function withSearchRoute(respond: SearchRespond) {
  return [
    function WithSearchRouteDecorator(Story: () => ReactNode) {
      return (
        <SearchRouteFixture respond={respond}>
          <Story />
        </SearchRouteFixture>
      );
    },
  ];
}

async function search(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.type(
    canvas.getByLabelText('Search Fleet Audit By Target'),
    'Jovie#123'
  );
  await userEvent.click(canvas.getByRole('button', { name: 'Search' }));
  return canvas;
}

/** Rendered states of the fleet audit panel beyond its default stories. */
const meta = {
  title: 'Admin/Fleet Audit/Panel/States',
  component: FleetAuditPanel,
  parameters: { layout: 'padded' },
  decorators: [
    function FleetFrameDecorator(Story) {
      return (
        <div className='bg-base text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
  args: { initial: fleetSummary() },
} satisfies Meta<typeof FleetAuditPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a quiet week with no dangerous or unattributed changes. */
export const EmptyQuietWeek: Story = {};

/** Loading: a target search is in flight. */
export const LoadingSearch: Story = {
  decorators: withSearchRoute(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement);
    await expect(await canvas.findByText('Searching.')).toBeInTheDocument();
  },
};

/** Error: the search route answered with a server error. */
export const ErrorSearchFailed: Story = {
  decorators: withSearchRoute(() =>
    Promise.resolve(new Response('{}', { status: 500 }))
  ),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement);
    await expect(
      await canvas.findByText('Search failed. Try again shortly.')
    ).toBeInTheDocument();
  },
};

/** Offline: the search request never reached the server. */
export const OfflineSearch: Story = {
  decorators: withSearchRoute(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement);
    await expect(
      await canvas.findByText('Search failed. Try again shortly.')
    ).toBeInTheDocument();
  },
};

/** Long content: many dangerous actions with long targets and reasons. */
export const LongContentActivity: Story = {
  args: {
    initial: fleetSummary({
      budget: { bytes_month: 96_500, limit_bytes: 100_000, pct: 96.5 },
      counts: { events_24h: 12_345, events_7d: 98_765 },
      dangerous: Array.from({ length: 8 }, (_, index) => ({
        ...fleetEvent,
        id: `e${index}`,
        target: `JovieInc/Jovie/pull/${25_000 + index}/files#diff-a-very-long-anchor-into-a-generated-file`,
        reason:
          'Force-pushed the release branch after the merge queue drained, replacing three commits that other lanes had already rebased onto',
      })),
      unattributed: [fleetUnattributed],
    }),
  },
};

/** Right-to-left: the panel inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    initial: fleetSummary({
      dangerous: [fleetEvent],
      unattributed: [fleetUnattributed],
    }),
  },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
