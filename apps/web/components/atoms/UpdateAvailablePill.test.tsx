import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  UpdateAvailablePill,
  UpdateAvailablePillView,
} from './UpdateAvailablePill';

const desktop = vi.hoisted(() => ({
  available: false,
  downloaded: false,
  install: vi.fn(),
}));
const web = vi.hoisted(() => ({ available: false, reload: vi.fn() }));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  useDesktopUpdate: () => desktop,
}));
vi.mock('@/lib/version/use-web-update', () => ({ useWebUpdate: () => web }));

describe('UpdateAvailablePillView', () => {
  it.each([
    ['downloading', 'Downloading update', true],
    ['ready-to-restart', 'Ready to restart', false],
    ['restarting', 'Restarting to update', true],
    ['web-ready', 'Update available', false],
    ['web-updating', 'Updating', false],
  ] as const)('labels the %s state', async (state, name, busy) => {
    const { container } = render(
      <UpdateAvailablePillView state={state} onClick={vi.fn()} />
    );
    const button = screen.getByRole('button', { name });
    expect(button).toHaveAttribute('aria-busy', String(busy));
    await expectNoA11yViolations(container);
  });

  it('fires onClick when the pill is ready', async () => {
    const onClick = vi.fn();
    render(<UpdateAvailablePillView state='web-ready' onClick={onClick} />);
    await userEvent.click(screen.getByTestId('update-available-pill'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks while busy', async () => {
    const onClick = vi.fn();
    render(<UpdateAvailablePillView state='downloading' onClick={onClick} />);
    await userEvent.click(screen.getByTestId('update-available-pill'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('UpdateAvailablePill', () => {
  beforeEach(() => {
    desktop.available = false;
    desktop.downloaded = false;
    desktop.install.mockClear();
    web.available = false;
    web.reload.mockClear();
  });

  it('renders nothing when no update is available', () => {
    const { container } = render(<UpdateAvailablePill />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reloads the web app on click', async () => {
    web.available = true;
    const { container } = render(<UpdateAvailablePill />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Update available' })
    );
    expect(web.reload).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Updating' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('installs a downloaded desktop update on click', async () => {
    desktop.available = true;
    desktop.downloaded = true;
    render(<UpdateAvailablePill />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Ready to restart' })
    );
    expect(desktop.install).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Restarting to update' })
    ).toBeDisabled();
  });

  it('shows a disabled downloading pill and does not install', async () => {
    desktop.available = true;
    render(<UpdateAvailablePill />);
    const button = screen.getByRole('button', { name: 'Downloading update' });
    await userEvent.click(button);
    expect(desktop.install).not.toHaveBeenCalled();
  });
});
