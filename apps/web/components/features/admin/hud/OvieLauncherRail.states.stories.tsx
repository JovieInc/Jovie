import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { OvieLauncherInventory } from '@/lib/hud/ovie-launchers';
import { OvieLauncherRail } from './OvieLauncherRail';
import {
  EMPTY_LAUNCHER_INVENTORY,
  launcherInventory,
} from './ovieLauncher.test-fixtures';

type InventoryRespond = () => Promise<Response>;

const INVENTORY_ROUTE = '/api/admin/hud/ovie-launchers';

/**
 * Answers the launcher inventory route for one story and restores the real
 * fetch when the story unmounts. Every other request goes to the real fetch.
 */
function InventoryRouteFixture({
  respond,
  children,
}: Readonly<{ respond: InventoryRespond; children: ReactNode }>) {
  const [restore] = useState(() => {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(INVENTORY_ROUTE)) return respond();
      return original(input, init);
    }) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  });
  useEffect(() => restore, [restore]);
  return <>{children}</>;
}

function withInventoryRoute(respond: InventoryRespond) {
  return [
    function WithInventoryRouteDecorator(Story: () => ReactNode) {
      return (
        <InventoryRouteFixture respond={respond}>
          <div className='w-full max-w-3xl'>
            <Story />
          </div>
        </InventoryRouteFixture>
      );
    },
  ];
}

function inventoryResponse(inventory: OvieLauncherInventory) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(inventory), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
}

function statusResponse(status: number) {
  return () => Promise.resolve(new Response('{}', { status }));
}

/** Rendered states of the launcher rail beyond its default story. */
const meta = {
  title: 'Features/Admin/Hud/OvieLauncherRail/States',
  component: OvieLauncherRail,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof OvieLauncherRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the inventory request is in flight; the skeleton holds the slots. */
export const LoadingInventory: Story = {
  decorators: withInventoryRoute(() => new Promise<Response>(() => undefined)),
};

/** Empty: the inventory came back with no launchers at all. */
export const EmptyInventory: Story = {
  decorators: withInventoryRoute(inventoryResponse(EMPTY_LAUNCHER_INVENTORY)),
};

/** Error: the inventory route had an outage. */
export const ErrorOutage: Story = {
  decorators: withInventoryRoute(statusResponse(500)),
};

/** Permission denied: the admin step-up lock (403) asks for Touch ID. */
export const PermissionDeniedLocked: Story = {
  decorators: withInventoryRoute(statusResponse(403)),
};

/** Offline: the inventory request never reached the server. */
export const OfflineInventory: Story = {
  decorators: withInventoryRoute(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
};

/** Partial: some launchers are unavailable or not configured. */
export const PartialSomeUnavailable: Story = {
  decorators: withInventoryRoute(
    inventoryResponse(
      launcherInventory(id =>
        id === 'gmail' ? 'unavailable' : id === 'stripe' ? 'error' : 'ready'
      )
    )
  ),
};

/** Long content: a long search in All tools that matches nothing. */
export const LongContentSearch: Story = {
  decorators: withInventoryRoute(inventoryResponse(launcherInventory())),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('All tools'));
    await userEvent.type(
      canvas.getByLabelText('Search All Tools'),
      'a very long search for a launcher that this workspace does not have'
    );
    await expect(
      canvas.getByText('No tools match that search.')
    ).toBeInTheDocument();
  },
};

/** Right-to-left: the loaded rail inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    ...withInventoryRoute(inventoryResponse(launcherInventory())),
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
