/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { downloadingUpdate } from '@/lib/desktop/desktop-updates.test-utils';
import { DesktopUpdateModalView } from './DesktopUpdateModal';

function renderDownload(transferredBytes: number, bytesPerSecond: number) {
  const onLater = vi.fn();
  render(
    <DesktopUpdateModalView
      open
      state={{
        ...downloadingUpdate(10),
        transferredBytes,
        totalBytes: 200 * 1024 * 1024,
        bytesPerSecond,
      }}
      version='26.9.16'
      notes={null}
      loading={false}
      onDownload={vi.fn()}
      onInstall={vi.fn()}
      onRetry={vi.fn()}
      onLater={onLater}
    />
  );
  return onLater;
}

describe('Desktop update download feedback', () => {
  it.each([
    [128 * 1024, 256 * 1024, '128 KB', '256 KB/s'],
    [512, 1, '512 B', '1 B/s'],
    [1, 0.25, '1 B', '<1 B/s'],
    [1024 * 1024, 1024 * 1024, '1 MB', '1 MB/s'],
  ])(
    'shows positive progress and speed at %i bytes and %i bytes/s',
    (transferred, speed, progressLabel, speedLabel) => {
      renderDownload(transferred, speed);
      expect(
        screen.getByText(`${progressLabel} of 200 MB`)
      ).toBeInTheDocument();
      expect(screen.getByText(speedLabel)).toBeInTheDocument();
      expect(screen.queryByText('0 MB/s')).not.toBeInTheDocument();
    }
  );

  it('does not invent a speed before the updater measures one', () => {
    renderDownload(0, 0);
    expect(screen.getByText('0 B of 200 MB')).toBeInTheDocument();
    expect(screen.queryByText(/\/s$/)).not.toBeInTheDocument();
  });

  it('keeps unknown totals indeterminate instead of inventing a percentage', () => {
    render(
      <DesktopUpdateModalView
        open
        state={{ ...downloadingUpdate(0), totalBytes: 0 }}
        notes={null}
        loading={false}
        onDownload={vi.fn()}
        onInstall={vi.fn()}
        onRetry={vi.fn()}
        onLater={vi.fn()}
      />
    );
    expect(screen.getByRole('progressbar')).not.toHaveAttribute(
      'aria-valuenow'
    );
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('focuses Hide when the download begins and retains focus as progress changes', () => {
    const props = {
      open: true,
      notes: null,
      loading: false,
      onDownload: vi.fn(),
      onInstall: vi.fn(),
      onRetry: vi.fn(),
      onLater: vi.fn(),
    };
    const { rerender } = render(
      <DesktopUpdateModalView
        {...props}
        state={{
          state: 'available',
          version: '26.9.16',
          notesUrl: '/changelog',
        }}
      />
    );
    expect(screen.getByRole('button', { name: 'Download' })).toHaveFocus();
    rerender(
      <DesktopUpdateModalView {...props} state={downloadingUpdate(12)} />
    );
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveFocus();
    rerender(
      <DesktopUpdateModalView {...props} state={downloadingUpdate(75)} />
    );
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveFocus();
  });

  it('offers a manual download without replacing the active update', () => {
    renderDownload(0, 0);
    expect(
      screen.getByRole('link', { name: 'Download the latest version' })
    ).toHaveAttribute('href', '/download');
    expect(
      screen.getByRole('link', { name: 'Download the latest version' })
    ).toHaveAttribute('target', '_blank');
  });

  it('keeps Escape available while the download continues', async () => {
    const onLater = renderDownload(128 * 1024, 256 * 1024);
    await userEvent.keyboard('{Escape}');
    expect(onLater).toHaveBeenCalledTimes(1);
  });
});
