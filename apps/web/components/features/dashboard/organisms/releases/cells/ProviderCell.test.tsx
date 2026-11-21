// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { TooltipProvider } from '@jovie/ui';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));

import { ProviderCell } from './ProviderCell';

type Props = ComponentProps<typeof ProviderCell>;

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Midnight Signal',
  status: 'released',
  releaseDate: '2026-01-01',
  slug: 'midnight-signal',
  smartLinkPath: '/r/midnight-signal',
  providers: [
    {
      key: 'spotify' as ProviderKey,
      url: 'https://open.spotify.com/track/abc',
      path: '/r/midnight-signal?utm_source=spotify',
      label: 'Spotify',
      isPrimary: true,
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
};

const missing: ReleaseViewModel = { ...release, providers: [] };

function renderCell(overrides: Partial<Props> = {}) {
  const onCopy = vi.fn().mockResolvedValue('copied');
  const view = render(
    <TooltipProvider>
      <ProviderCell
        release={release}
        provider={'spotify' as ProviderKey}
        config={{ label: 'Spotify', accent: '#22c55e' }}
        onCopy={onCopy}
        {...overrides}
      />
    </TooltipProvider>
  );
  return { ...view, onCopy };
}

// These render full tables and Radix menus; a loaded CI runner needs more than
// the default five seconds.
vi.setConfig({ testTimeout: 20_000 });

describe('ProviderCell certificate', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the provider link in a new tab', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    const { container, onCopy } = renderCell();

    expect(
      screen.getByRole('img', { name: 'Auto-synced provider link' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith(
      'https://open.spotify.com/track/abc',
      '_blank',
      'noopener,noreferrer'
    );
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('copies the tracked smart link, confirms, then resets after two seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container, onCopy } = renderCell();

    const copy = screen.getByTestId('provider-copy-release-1-spotify');
    expect(copy).toHaveAttribute(
      'data-url',
      'https://jov.ie/r/midnight-signal?utm_source=spotify'
    );
    await user.click(copy);
    expect(onCopy).toHaveBeenCalledWith(
      '/r/midnight-signal?utm_source=spotify',
      'Midnight Signal – Spotify',
      'provider-copy-release-1-spotify'
    );
    const copied = await screen.findByRole('button', { name: 'Copied' });
    expect(copied).toBeInTheDocument();
    // size=sm → icon-sm (h-7) matches the h-7 pill; Check glyph wears success.
    expect(copied.className).toContain('h-7');
    expect(copied.querySelector('.text-success')).not.toBeNull();
    await expectNoA11yViolations(container);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('stays on Copy when the copy is rejected', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockRejectedValue(new Error('denied'));
    renderCell({ onCopy });

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
  });

  it('does not copy a link that has no tracked path', async () => {
    const user = userEvent.setup();
    const { onCopy } = renderCell({
      release: {
        ...release,
        providers: [{ ...release.providers[0], path: '', source: 'manual' }],
      },
    });

    expect(
      screen.getByRole('img', { name: 'Manually added provider link' })
    ).toBeInTheDocument();
    const copy = screen.getByRole('button', { name: 'Copy' });
    expect(copy).not.toHaveAttribute('data-url');
    await user.click(copy);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('shows a dash when the link is missing and cannot be added', async () => {
    const { container } = renderCell({ release: missing });

    expect(
      screen.getByRole('img', { name: 'Missing provider link' })
    ).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('validates, then saves a pasted provider URL for this release', async () => {
    const user = userEvent.setup();
    const onAddUrl = vi.fn().mockResolvedValue(undefined);
    const { container } = renderCell({ release: missing, onAddUrl });

    await user.click(screen.getByRole('button', { name: 'Add Spotify link' }));
    const input = await screen.findByPlaceholderText('Paste URL here...');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expectNoA11yViolations(container);

    await user.type(input, 'https://example.com/track/abc');
    expect(input).toHaveValue('https://example.com/track/abc');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/^URL must be from/)).toBeInTheDocument();
    expect(onAddUrl).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'https://open.spotify.com/track/abc');
    expect(screen.queryByText(/^URL must be from/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onAddUrl).toHaveBeenCalledWith(
        'release-1',
        'spotify',
        'https://open.spotify.com/track/abc'
      )
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Paste URL here...')).toBeNull()
    );
  });

  it('cancels the add popover without saving and locks it while saving', async () => {
    const user = userEvent.setup();
    const onAddUrl = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderCell({ release: missing, onAddUrl });

    await user.click(screen.getByRole('button', { name: 'Add Spotify link' }));
    await user.type(
      await screen.findByPlaceholderText('Paste URL here...'),
      'https://open.spotify.com/track/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Paste URL here...')).toBeNull()
    );
    expect(onAddUrl).not.toHaveBeenCalled();

    rerender(
      <TooltipProvider>
        <ProviderCell
          release={missing}
          provider={'spotify' as ProviderKey}
          config={{ label: 'Spotify', accent: '#22c55e' }}
          onCopy={vi.fn()}
          onAddUrl={onAddUrl}
          isAddingUrl
        />
      </TooltipProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Add Spotify link' }));
    expect(
      await screen.findByPlaceholderText('Paste URL here...')
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});
