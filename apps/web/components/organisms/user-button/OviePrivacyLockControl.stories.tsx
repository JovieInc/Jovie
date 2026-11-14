import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useLayoutEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { WorkspacePrivacyLockState } from '@/lib/workspace-lock/workspace-lock';
import { OviePrivacyLockControl } from './OviePrivacyLockControl';

const OFF: WorkspacePrivacyLockState = {
  enabled: false,
  locked: false,
  unlockedUntil: null,
};
const ON_UNLOCKED: WorkspacePrivacyLockState = {
  enabled: true,
  locked: false,
  unlockedUntil: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
};
const ON_LOCKED: WorkspacePrivacyLockState = {
  enabled: true,
  locked: true,
  unlockedUntil: null,
};
const UNSUPPORTED_DESKTOP_MESSAGE =
  'This Jovie app cannot show the passkey prompt yet. Open Jovie in your browser to unlock.';

const PASSWORD_MANAGER_PASSKEY_MESSAGE =
  'The passkey offered by your password manager is not registered to this account. Try again to set up a new passkey, or choose a different authenticator.';

type StoryArgs = {
  initialState: WorkspacePrivacyLockState;
  readiness: () => Promise<void>;
  /** The local state endpoint answers 503, as when the server is unreachable. */
  loadFails?: boolean;
  /** Account row shown above the control, as in the user menu. */
  accountLabel?: string;
  dir?: 'ltr' | 'rtl';
};

function LocalPrivacyLockApi({
  initialState,
  readiness,
  loadFails = false,
  accountLabel,
  dir,
}: StoryArgs) {
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('/api/ovie/privacy-lock')) {
        if (loadFails) {
          return new Response(JSON.stringify({ code: 'unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!init?.method || init.method === 'GET') {
          return new Response(JSON.stringify(initialState), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({ error: 'Stories never mutate privacy settings.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Unexpected network request in privacy-lock story.');
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [initialState, loadFails]);

  return (
    <div
      dir={dir}
      className='w-80 rounded-lg border border-subtle bg-surface-1 p-1 shadow-lg'
    >
      {accountLabel ? (
        <p className='px-3 pt-2 text-xs font-medium text-primary-token'>
          {accountLabel}
        </p>
      ) : null}
      <OviePrivacyLockControl ensurePrivacyLockCanBeEnabled={readiness} />
    </div>
  );
}

const meta = {
  title: 'Organisms/UserButton/OviePrivacyLockControl',
  component: LocalPrivacyLockApi,
  parameters: {
    layout: 'centered',
    docs: {
      story: { inline: false, height: '180px' },
      description: {
        component:
          'Ovie-only privacy setting. Stories use a local state endpoint and never complete passkey ceremonies or change account settings.',
      },
    },
  },
  args: {
    initialState: OFF,
    readiness: async () => {},
  },
} satisfies Meta<typeof LocalPrivacyLockApi>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', {
        name: 'Enable Ovie privacy lock',
      })
    ).toBeEnabled();
  },
};

export const OnUnlocked: Story = {
  args: { initialState: ON_UNLOCKED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('On · unlocked for up to 24 hours')
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Turn off Ovie privacy lock' })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Lock Ovie Now' })
    ).toBeInTheDocument();
  },
};

export const Locked: Story = {
  args: { initialState: ON_LOCKED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Ovie is locked');
    await canvas.findByText('Unlock with your passkey to continue.');
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const PendingEnable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: 'Enable Ovie privacy lock' });
    await userEvent.click(
      canvas.getByRole('button', { name: 'Enable Ovie privacy lock' })
    );
    await expect(
      await canvas.findByRole('button', { name: 'Updating…' })
    ).toBeDisabled();
  },
  args: {
    readiness: () => new Promise<void>(() => undefined),
  },
};

export const UnsupportedRuntime: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: 'Enable Ovie privacy lock' });
    await userEvent.click(
      canvas.getByRole('button', { name: 'Enable Ovie privacy lock' })
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      UNSUPPORTED_DESKTOP_MESSAGE
    );
    await canvas.findByRole('button', { name: 'Enable Ovie privacy lock' });
  },
  args: {
    readiness: async () => {
      throw new Error(UNSUPPORTED_DESKTOP_MESSAGE);
    },
  },
};

/** Error: the privacy settings cannot be loaded, so the action stays disabled. */
export const ErrorSettingsUnavailable: Story = {
  args: { loadFails: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Could not confirm the Ovie privacy lock. Check your connection and try again.'
    );
    await expect(
      canvas.getByRole('button', { name: 'Loading privacy settings…' })
    ).toBeDisabled();
  },
};

/** Long content: the longest passkey readiness message wraps under the action. */
export const LongContentPasskeyMessage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Enable Ovie privacy lock' })
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      PASSWORD_MANAGER_PASSKEY_MESSAGE
    );
  },
  args: {
    readiness: async () => {
      throw new Error(PASSWORD_MANAGER_PASSKEY_MESSAGE);
    },
  },
};

/**
 * Right-to-left: the control inside an RTL user menu under an Arabic account
 * name. Its own copy is English today and keeps its reading order.
 */
export const RtlArabicAccountMenu: Story = {
  args: {
    initialState: ON_UNLOCKED,
    accountLabel: 'ليلى حداد · مساحة عمل فرقة النور',
    dir: 'rtl',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Lock Ovie Now' })
    ).toBeInTheDocument();
  },
};
