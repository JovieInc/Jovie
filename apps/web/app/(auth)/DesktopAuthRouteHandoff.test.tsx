import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// State and accessibility coverage for the route handoff. The full browser,
// copy, code and Touch ID contract lives in tests/unit/app/desktop-auth-page.test.tsx.
const bridge = vi.hoisted(() => ({
  isElectronRuntime: vi.fn(() => false),
  openDesktopAuthUrl: vi.fn(),
  copyDesktopAuthUrl: vi.fn(),
  closeDesktopAuthWindow: vi.fn(),
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  closeDesktopAuthWindow: () => bridge.closeDesktopAuthWindow(),
  completeDesktopPasskeySignIn: vi.fn(),
  copyDesktopAuthUrl: (url: string) => bridge.copyDesktopAuthUrl(url),
  isElectronRuntime: () => bridge.isElectronRuntime(),
  openDesktopAuthUrl: (url: string) => bridge.openDesktopAuthUrl(url),
  redeemDesktopAuthReturnCode: vi.fn(),
  supportsDesktopAuthReturnCode: () => false,
  useDesktopAppBootSignal: vi.fn(),
  notifyDesktopAppBooted: vi.fn(),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: { signIn: { passkey: vi.fn() } },
}));

vi.mock('@/lib/utils/qr-code', () => ({
  generateQrCodeSvg: vi.fn().mockResolvedValue('<svg></svg>'),
}));

import {
  DesktopAuthRouteHandoff,
  useShouldRenderDesktopAuthHandoff,
} from './DesktopAuthRouteHandoff';

const handoff = () => screen.getByTestId('desktop-auth-route-handoff');

describe('DesktopAuthRouteHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.isElectronRuntime.mockReturnValue(false);
    bridge.openDesktopAuthUrl.mockResolvedValue({ ok: true });
    bridge.copyDesktopAuthUrl.mockResolvedValue({ ok: true });
    bridge.closeDesktopAuthWindow.mockResolvedValue(undefined);
    window.history.pushState({}, '', '/signin?runtime=electron');
  });

  it('renders the idle handoff with one primary browser action', async () => {
    const { container } = render(<DesktopAuthRouteHandoff />);

    expect(handoff()).toHaveAttribute('data-desktop-auth-state', 'idle');
    expect(handoff()).toHaveAttribute(
      'data-auth-shell-kind',
      'desktop-return-handoff'
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Finish Signing In' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue In Browser' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Cancel Sign-in' })
    ).toBeInTheDocument();
    expect(bridge.openDesktopAuthUrl).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('opens the current route in the browser and moves to the opened state', async () => {
    const user = userEvent.setup();
    const { container } = render(<DesktopAuthRouteHandoff />);

    await user.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );

    await waitFor(() =>
      expect(handoff()).toHaveAttribute('data-desktop-auth-state', 'opened')
    );
    expect(bridge.openDesktopAuthUrl).toHaveBeenCalledWith(
      window.location.href
    );
    expect(await screen.findByText('Check your browser.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('announces a failed browser launch and moves to the error state', async () => {
    const user = userEvent.setup();
    bridge.openDesktopAuthUrl.mockResolvedValue({
      ok: false,
      reason: 'desktop-auth-open-failed',
    });
    const { container } = render(<DesktopAuthRouteHandoff />);

    await user.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );

    await waitFor(() =>
      expect(handoff()).toHaveAttribute('data-desktop-auth-state', 'error')
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /The browser did not open/i
    );
    await expectNoA11yViolations(container);
  });

  it('opens the other sign-in options and copies the route link', async () => {
    const user = userEvent.setup();
    const { container } = render(<DesktopAuthRouteHandoff />);

    await user.click(
      screen.getByRole('button', { name: 'Other Sign-in Options' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Copy Sign-in Link' })
    );

    await waitFor(() =>
      expect(bridge.copyDesktopAuthUrl).toHaveBeenCalledWith(
        window.location.href
      )
    );
    await expectNoA11yViolations(container);
  });

  it('renders inside a right-to-left document without losing its actions', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DesktopAuthRouteHandoff />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'Continue In Browser' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('useShouldRenderDesktopAuthHandoff', () => {
  function Probe({ query }: Readonly<{ query: string }>) {
    const shouldRender = useShouldRenderDesktopAuthHandoff(
      new URLSearchParams(query)
    );
    return <output>{String(shouldRender)}</output>;
  }

  beforeEach(() => {
    bridge.isElectronRuntime.mockReturnValue(false);
  });

  it.each([
    ['runtime=electron', 'true'],
    ['redirect_url=%2Fapp%2Fchat%3Fruntime%3Delectron', 'true'],
    ['redirect_url=%2Fapp%2Fchat', 'false'],
    ['', 'false'],
  ])('reads the runtime hint from %j', (query, expected) => {
    render(<Probe query={query} />);
    expect(screen.getByRole('status')).toHaveTextContent(expected);
  });

  it('switches to the handoff once the Electron runtime is detected', async () => {
    bridge.isElectronRuntime.mockReturnValue(true);
    render(<Probe query='' />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('true')
    );
  });
});
