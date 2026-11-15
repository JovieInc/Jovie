import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OvieLauncherRail } from './OvieLauncherRail';
import {
  EMPTY_LAUNCHER_INVENTORY,
  launcherInventory,
} from './ovieLauncher.test-fixtures';

const pushMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/desktop/electron-bridge', () => ({
  launchOperatorControl: vi.fn().mockResolvedValue({ ok: true }),
  useIsElectronRuntime: () => false,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

function stubInventory(response: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

afterEach(() => {
  vi.unstubAllGlobals();
  pushMock.mockReset();
});

describe('OvieLauncherRail certificate', () => {
  it('holds the skeleton while the inventory loads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined))
    );
    const { container } = render(<OvieLauncherRail />);
    expect(screen.getByTestId('ovie-launcher-skeleton')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('asks for the admin step-up unlock on a 403', async () => {
    stubInventory({ ok: false, status: 403, json: async () => ({}) });
    const { container } = render(<OvieLauncherRail />);
    expect(
      await screen.findByText(
        'Admin data is locked. Unlock with Touch ID, then retry.'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports an offline inventory and retries on request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ ok: true, json: async () => launcherInventory() });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<OvieLauncherRail />);

    expect(
      await screen.findByText('Launcher destinations could not be loaded.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: /Retry/ }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByTestId('ovie-launcher-group-internal')
    ).toBeInTheDocument();
  });

  it('keeps the typed search and focus through a parent rerender and Escape', async () => {
    const user = userEvent.setup();
    stubInventory({ ok: true, json: async () => launcherInventory() });
    const { rerender } = render(<OvieLauncherRail />);
    await screen.findByTestId('ovie-launcher-group-internal');

    await user.click(screen.getByText('All tools'));
    const search = screen.getByRole('searchbox', { name: 'Search All Tools' });
    await user.type(search, 'zzz-no-such-tool');
    rerender(<OvieLauncherRail />);

    const after = screen.getByRole('searchbox', { name: 'Search All Tools' });
    expect(after).toHaveValue('zzz-no-such-tool');
    expect(after).toHaveFocus();
    expect(screen.getByText('No tools match that search.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    after.blur();
    expect(after).toHaveValue('zzz-no-such-tool');
  });

  it('renders an empty inventory without launchers and stays axe-clean', async () => {
    stubInventory({ ok: true, json: async () => EMPTY_LAUNCHER_INVENTORY });
    const { container } = render(<OvieLauncherRail />);
    expect(
      await screen.findByText('No tools match that search.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders nothing compact when no launcher is ready', async () => {
    stubInventory({
      ok: true,
      json: async () => launcherInventory(() => 'unavailable'),
    });
    const { container } = render(<OvieLauncherRail compact />);
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
