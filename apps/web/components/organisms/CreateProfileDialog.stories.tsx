import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { CreateIdentityDialog } from './CreateProfileDialog';

const CREATE_ROUTE = '/api/dashboard/profile/create';

/**
 * Submits post to the create route. Stories answer that one route from a
 * fixture (or never, or with a network failure) so no request leaves the
 * browser.
 */
function stubCreateRoute(answer: 'pending' | 'offline' | { error: string }) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    if (!String(input).includes(CREATE_ROUTE)) {
      throw new Error('Unexpected network request in CreateIdentityDialog.');
    }
    if (answer === 'pending') return new Promise<Response>(() => {});
    if (answer === 'offline') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ success: false, ...answer }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

// The dialog portals to document.body, so play functions query the body.
const body = () => within(document.body);

async function fill(displayName: string, username?: string) {
  await userEvent.type(
    await body().findByLabelText('Display Name'),
    displayName
  );
  if (username !== undefined)
    await userEvent.type(body().getByLabelText('Username'), username);
}

async function fillAndSubmit() {
  await fill('Second Act', 'secondact');
  await userEvent.click(
    body().getByRole('button', { name: 'Create Identity' })
  );
}

const meta = {
  title: 'Organisms/CreateIdentityDialog',
  component: CreateIdentityDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof CreateIdentityDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Closed: Story = {
  args: {
    open: false,
  },
};

/** The identity is being created: the form is disabled while it saves. */
export const LoadingCreating: Story = {
  beforeEach: () => stubCreateRoute('pending'),
  play: async () => {
    await fillAndSubmit();
    await waitFor(() =>
      expect(body().getByLabelText('Display Name')).toBeDisabled()
    );
  },
};

/** The server rejects the username: the error shows and the typed values stay. */
export const ErrorUsernameReserved: Story = {
  beforeEach: () => stubCreateRoute({ error: 'Username is reserved' }),
  play: async () => {
    await fillAndSubmit();
    await expect(await body().findByRole('alert')).toHaveTextContent(
      'Username is reserved'
    );
    await expect(body().getByLabelText('Username')).toHaveValue('secondact');
  },
};

/** The request never reaches the server: a retryable message, values kept. */
export const OfflineRequestFailed: Story = {
  beforeEach: () => stubCreateRoute('offline'),
  play: async () => {
    await fillAndSubmit();
    await expect(await body().findByRole('alert')).toHaveTextContent(
      "Couldn't create identity. Try again."
    );
  },
};

/** The session has expired: the server refuses and says so inline. */
export const PermissionDeniedSignedOut: Story = {
  beforeEach: () => stubCreateRoute({ error: 'Unauthorized' }),
  play: async () => {
    await fillAndSubmit();
    await expect(await body().findByRole('alert')).toHaveTextContent(
      'Unauthorized'
    );
  },
};

/** Only the display name is filled: Create Identity waits for a username. */
export const PartialDisplayNameOnly: Story = {
  play: async () => {
    await fill('Second Act');
    await expect(
      body().getByRole('button', { name: 'Create Identity' })
    ).toBeDisabled();
  },
};

/** A long display name and username stay inside the fields. */
export const LongContentNames: Story = {
  play: async () => {
    await fill(
      'The Midnight Orchestra Featuring Every Guest Vocalist From The Tour',
      'the-midnight-orchestra-featuring-every-guest-vocalist'
    );
  },
};

function RtlDocument({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('dir');
    root.setAttribute('dir', 'rtl');
    return () => {
      if (previous === null) root.removeAttribute('dir');
      else root.setAttribute('dir', previous);
    };
  }, []);
  return <>{children}</>;
}

/** Right to left: the portalled dialog follows the document direction. */
export const RtlArabicName: Story = {
  decorators: [
    Story => (
      <RtlDocument>
        <Story />
      </RtlDocument>
    ),
  ],
  play: async () => {
    await fill('الفرقة الليلية');
  },
};
