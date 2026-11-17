import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import type { DeliveryLanes } from '@/lib/ovie/shipping-state/contract';
import { FleetVerdictPanel, FleetVerdictPanelView } from './FleetVerdictPanel';

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;

/**
 * Drives the live FleetVerdictPanel through the Storybook /api fetch hook.
 * The mock is registered while the fixture first renders, before the query
 * fetches, and is removed on unmount; a fresh client keeps each story's
 * shipping read isolated.
 */
function ShippingReadFixture({
  respond,
  children,
}: Readonly<{ respond: () => Promise<Response>; children: ReactNode }>) {
  const [{ client, restore }] = useState(() => {
    const apiWindow = window as Window & { __jovieApiMock?: ApiMock };
    const previous = apiWindow.__jovieApiMock;
    apiWindow.__jovieApiMock = request =>
      request.url.pathname === '/api/hud/shipping-state'
        ? respond()
        : previous?.(request);
    return {
      client: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
      restore: () => {
        apiWindow.__jovieApiMock = previous;
      },
    };
  });
  useEffect(() => restore, [restore]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function withShippingRead(respond: () => Promise<Response>) {
  return [
    function WithShippingReadDecorator() {
      return (
        <ShippingReadFixture respond={respond}>
          <FleetVerdictPanel />
        </ShippingReadFixture>
      );
    },
  ];
}

const meta = {
  title: 'Features/Admin/Hud/FleetVerdictPanel States',
  component: FleetVerdictPanelView,
  parameters: { layout: 'centered' },
  args: {
    lanes: null,
    verdict: {
      level: 'unknown',
      headline: 'Fleet health not measured',
      reasons: [],
      capacity: null,
    },
  },
} satisfies Meta<typeof FleetVerdictPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the shipping read has not answered yet. */
export const LoadingShippingRead: Story = {
  decorators: withShippingRead(() => new Promise<Response>(() => {})),
};

/** Error: the shipping read answered with a server error. */
export const ErrorShippingRead: Story = {
  decorators: withShippingRead(async () =>
    Response.json({ error: 'unavailable' }, { status: 500 })
  ),
};

/** Offline: the shipping read never reached the server. */
export const OfflineShippingRead: Story = {
  decorators: withShippingRead(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
};

/** Empty: the fleet reported no lanes, reasons or counts. */
export const EmptyNotMeasured: Story = {};

const manyLanes = {
  heldByReason: {
    'needs-human-decision': 14,
    'waiting-on-a-very-long-review-queue-before-merge': 9,
    'design-review-required': 3,
  },
  failedByReason: {
    'harness-failed': 61,
    'typecheck-timed-out-after-the-runner-ran-out-of-memory': 12,
  },
} as unknown as DeliveryLanes;

/** Long content: many reasons and long reason keys wrap beside their counts. */
export const LongContentReasons: Story = {
  args: {
    lanes: manyLanes,
    verdict: {
      level: 'degraded',
      headline:
        'Fleet degraded: Remediation alerts are not being acknowledged (57 failed delivery records) (+3 more)',
      reasons: [
        'Remediation alerts are not being acknowledged (57 failed delivery records)',
        'The merge queue has been above its threshold for more than six hours',
        'Disk free space on the shared runner pool is below ten percent',
        'Two lanes have not landed a change since yesterday morning',
      ],
      capacity: '2 of 3 lanes running',
    },
  },
};

/** Right-to-left: the verdict inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    lanes: manyLanes,
    verdict: {
      level: 'healthy',
      headline: 'الأسطول سليم: ثلاثة من ثلاثة مسارات تعمل',
      reasons: [],
      capacity: '3 of 3 lanes running',
    },
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
