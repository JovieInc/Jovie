import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ElectronAPI } from '@/lib/desktop/electron-bridge';
import { DesktopAuthClient } from './DesktopAuthClient';

type AuthBridge = Pick<
  ElectronAPI,
  | 'closeDesktopAuthWindow'
  | 'copyDesktopAuthUrl'
  | 'openDesktopAuthUrl'
  | 'redeemDesktopAuthReturnCode'
>;

const ok = async () => ({ ok: true });

/**
 * Stories never reach a Mac main process. Each one installs a local stand-in
 * for the handoff's `window.electronAPI` methods and restores whatever the
 * preview had once the story unmounts.
 */
function stubAuthBridge(overrides: Partial<AuthBridge> = {}) {
  return () => {
    const previous = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    const bridge: Partial<AuthBridge> = {
      closeDesktopAuthWindow: ok,
      copyDesktopAuthUrl: ok,
      openDesktopAuthUrl: ok,
      redeemDesktopAuthReturnCode: ok,
      ...overrides,
    };
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: bridge,
    });
    return () => {
      if (previous) Object.defineProperty(window, 'electronAPI', previous);
      else Reflect.deleteProperty(window, 'electronAPI');
    };
  };
}

const AUTH_URL_PARAM =
  '/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fsettings&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256';

async function openOptions(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole('button', { name: 'Other Sign-in Options' })
  );
  return canvas;
}

const meta = {
  title: 'Desktop/DesktopAuthClient',
  component: DesktopAuthClient,
  parameters: { layout: 'fullscreen' },
  args: { authUrlParam: AUTH_URL_PARAM, touchIdHint: false },
  beforeEach: stubAuthBridge(),
} satisfies Meta<typeof DesktopAuthClient>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The browser handoff waiting for the first press. */
export const Default: Story = {};

/** Jovie opened the window without a sign-in link: every action waits. */
export const EmptyAuthUrl: Story = {
  args: { authUrlParam: null },
};

/** The browser is opening: the primary action and the options wait. */
export const LoadingOpeningBrowser: Story = {
  beforeEach: stubAuthBridge({
    openDesktopAuthUrl: () => new Promise(() => undefined),
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Continue In Browser' })
    );
    await expect(
      await canvas.findByRole('button', { name: 'Opening Browser...' })
    ).toBeDisabled();
  },
};

/** The main process could not open the browser: the action becomes a retry. */
export const ErrorBrowserDidNotOpen: Story = {
  beforeEach: stubAuthBridge({
    openDesktopAuthUrl: async () => ({
      ok: false,
      reason: 'shell-open-failed',
    }),
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Continue In Browser' })
    );
    await expect(
      await canvas.findByRole('button', { name: 'Try Again' })
    ).toBeEnabled();
  },
};

/** An older Mac build without return-code redeem: the options omit code entry. */
export const PartialWithoutCodeEntry: Story = {
  beforeEach: stubAuthBridge({ redeemDesktopAuthReturnCode: undefined }),
  play: async ({ canvasElement }) => {
    const canvas = await openOptions(canvasElement);
    await canvas.findByTestId('desktop-auth-options');
    await expect(
      canvas.queryByRole('button', { name: 'Enter A Code' })
    ).toBeNull();
  },
};

/** The phone path carries the handoff's longest copy beside the QR tile. */
export const LongCopyPhoneSignIn: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openOptions(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Scan With Phone' })
    );
    await canvas.findByRole('img', { name: 'QR Code With Your Sign-in Link' });
  },
};

/** The return code never reached Jovie: the code stays for a retry. */
export const OfflineCodeRedeem: Story = {
  beforeEach: stubAuthBridge({
    redeemDesktopAuthReturnCode: async () => ({ ok: false }),
  }),
  play: async ({ canvasElement }) => {
    const canvas = await openOptions(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Enter A Code' })
    );
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Code From Your Browser' }),
      'BCDFGHJK'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent(
        'Could not reach Jovie. Check your connection and try again.'
      )
    );
  },
};

/** The handoff inside a right-to-left window. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
