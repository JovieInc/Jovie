/**
 * @vitest-environment jsdom
 * JOV-6683: the update modal renders each updater state (available,
 * downloading, ready, error) and routes its actions to the right callback.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  availableUpdate,
  downloadingUpdate,
} from '@/lib/desktop/desktop-updates.test-utils';
import {
  DesktopUpdateModal,
  DesktopUpdateModalView,
} from './DesktopUpdateModal';

const NOTES_URL = 'https://jov.ie/changelog';
const available = availableUpdate('26.9.16');

function renderView(
  state: Parameters<typeof DesktopUpdateModalView>[0]['state'],
  overrides: Partial<Parameters<typeof DesktopUpdateModalView>[0]> = {}
) {
  const props = {
    open: true,
    state,
    notes: null,
    loading: false,
    onDownload: vi.fn(),
    onInstall: vi.fn(),
    onRetry: vi.fn(),
    onLater: vi.fn(),
    ...overrides,
  };
  render(<DesktopUpdateModalView {...props} />);
  return props;
}

describe('DesktopUpdateModalView', () => {
  it('shows release notes and starts the download from the available state', async () => {
    const props = renderView(available, {
      notes: { summary: 'Ship it', items: ['Faster sync'] },
    });
    expect(screen.getByText('Jovie 26.9.16 is available')).toBeInTheDocument();
    expect(screen.getByText('Faster sync')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(props.onDownload).toHaveBeenCalledTimes(1);
  });

  it('links to release notes when none were fetched and dismisses via Later', async () => {
    const props = renderView(available);
    expect(
      screen.getByRole('link', { name: 'Read the release notes' })
    ).toHaveAttribute('href', NOTES_URL);

    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(props.onLater).toHaveBeenCalledTimes(1);
  });

  it('renders download progress', () => {
    renderView(downloadingUpdate(42));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Downloading update')).toBeInTheDocument();
  });

  it('offers restart in the ready state and retry in the error state', async () => {
    const ready = renderView({ state: 'ready', version: '26.9.16' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Restart to update' })
    );
    expect(ready.onInstall).toHaveBeenCalledTimes(1);

    const error = renderView({
      state: 'error',
      message: 'offline',
      retryable: true,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(error.onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('DesktopUpdateModal', () => {
  it('renders nothing for non-actionable states', () => {
    render(
      <DesktopUpdateModal
        open
        state={{ state: 'idle' }}
        onDownload={vi.fn()}
        onInstall={vi.fn()}
        onRetry={vi.fn()}
        onLater={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
