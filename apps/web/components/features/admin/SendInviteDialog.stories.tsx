import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { SendInviteDialog } from './SendInviteDialog';

type InviteRespond = () => Promise<Response>;

const INVITE_ROUTE = '/api/admin/creator-invite';

/**
 * Answers the invite route for one story and restores the real fetch when
 * the story unmounts. Every other request goes to the real fetch.
 */
function InviteRouteFixture({
  respond,
  children,
}: Readonly<{ respond: InviteRespond; children: ReactNode }>) {
  const [restore] = useState(() => {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(INVITE_ROUTE)) return respond();
      return original(input, init);
    }) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  });
  useEffect(() => restore, [restore]);
  return <>{children}</>;
}

function withInviteRoute(respond: InviteRespond) {
  return [
    function WithInviteRouteDecorator(Story: () => ReactNode) {
      return (
        <InviteRouteFixture respond={respond}>
          <Story />
        </InviteRouteFixture>
      );
    },
  ];
}

const profile = {
  id: 'profile-1',
  username: 'ava',
  displayName: 'Ava',
  avatarUrl: null,
} as AdminCreatorProfileRow;

async function typeEmailAndSubmit(canvasElement: HTMLElement, email: string) {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.type(await body.findByRole('textbox'), email);
  await userEvent.click(body.getByRole('button', { name: 'Create Invite' }));
  return body;
}

const meta = {
  title: 'Features/Admin/SendInviteDialog',
  component: SendInviteDialog,
  parameters: { layout: 'centered' },
  args: { profile, open: true, onOpenChange: () => undefined },
} satisfies Meta<typeof SendInviteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no email typed yet, so the invite cannot be created. */
export const EmptyEmail: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole('button', { name: 'Create Invite' })
    ).toBeDisabled();
  },
};

/** Loading: the invite request is in flight. */
export const LoadingCreate: Story = {
  decorators: withInviteRoute(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    const body = await typeEmailAndSubmit(canvasElement, 'ava@example.com');
    await expect(
      await body.findByRole('button', { name: 'Creating...' })
    ).toBeDisabled();
  },
};

/** Error: the server refused the invite and said why. */
export const ErrorServerRefused: Story = {
  decorators: withInviteRoute(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ ok: false, error: 'Profile is already claimed' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
  ),
  play: async ({ canvasElement }) => {
    const body = await typeEmailAndSubmit(canvasElement, 'ava@example.com');
    await expect(
      await body.findByText('Profile is already claimed')
    ).toBeInTheDocument();
  },
};

/** Offline: the request never reached the server; the typed email stays. */
export const OfflineRequest: Story = {
  decorators: withInviteRoute(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: async ({ canvasElement }) => {
    const body = await typeEmailAndSubmit(canvasElement, 'ava@example.com');
    await expect(await body.findByRole('textbox')).toHaveValue(
      'ava@example.com'
    );
  },
};

/** Long content: a long display name and handle in the profile card. */
export const LongContentProfile: Story = {
  args: {
    profile: {
      ...profile,
      displayName:
        'Ava and the Extraordinarily Long Touring Ensemble of the Northern Coast',
      username: 'ava-and-the-extraordinarily-long-touring-ensemble',
    } as AdminCreatorProfileRow,
  },
};

/** Right-to-left: the dialog inside an RTL document. */
export const RtlDocument: Story = {
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
