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

type StoryArgs = {
  initialState: WorkspacePrivacyLockState;
  readiness: () => Promise<void>;
};

function LocalPrivacyLockApi({ initialState, readiness }: StoryArgs) {
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('/api/ovie/privacy-lock')) {
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
  }, [initialState]);

  return (
    <div className='w-80 rounded-lg border border-subtle bg-surface-1 p-1 shadow-lg'>
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
