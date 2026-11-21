import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AvailabilityCell } from './AvailabilityCell';

const webRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../..'
);

/**
 * Token-compliance contract (Ion tokens only, no raw palette colors):
 * the manual-status ring and the copied-state feedback ride Noir Ion
 * tokens — never raw amber/emerald/orange utilities.
 */
describe('AvailabilityCell token compliance', () => {
  it('keeps status and copied feedback on Ion tokens, never raw palette colors', () => {
    const source = readFileSync(
      resolve(
        webRoot,
        'components/features/dashboard/organisms/releases/cells/AvailabilityCell.tsx'
      ),
      'utf8'
    );

    expect(source).not.toMatch(/emerald-|amber-|orange-|cyan-/);
    expect(source).toContain("'ring-2 ring-quaternary-token/40'");
    expect(source).toContain("isCopied && 'text-success'");
  });

  it('keeps the trigger accessible name anchored by the sr-only prefix (WCAG 2.5.3)', () => {
    const source = readFileSync(
      resolve(
        webRoot,
        'components/features/dashboard/organisms/releases/cells/AvailabilityCell.tsx'
      ),
      'utf8'
    );

    // The sr-only prefix leads the name and the visible rail text follows:
    // no shadowing aria-label on the trigger.
    expect(source).toContain(
      "<span className='sr-only'>Show provider availability details:</span>"
    );
    expect(source).not.toMatch(
      /aria-label='Show Provider Availability Details'/
    );
  });
});

const release: ReleaseViewModel = {
  id: 'release-1',
  profileId: 'profile-1',
  title: 'Midnight Signal',
  status: 'released',
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  slug: 'midnight-signal',
  smartLinkPath: '/r/midnight-signal',
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify',
      label: 'Spotify',
      url: 'https://open.spotify.com/track/abc',
      path: '/r/midnight-signal?utm_source=spotify',
      isPrimary: true,
      source: 'manual',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

function renderCell(
  props: Partial<React.ComponentProps<typeof AvailabilityCell>> = {}
) {
  return render(
    <AvailabilityCell
      release={release}
      allProviders={['spotify', 'apple_music']}
      providerConfig={PROVIDER_CONFIG}
      onCopy={vi.fn().mockResolvedValue('copied')}
      onAddUrl={vi.fn().mockResolvedValue(undefined)}
      {...props}
    />
  );
}

const trigger = () =>
  screen.getByRole('button', { name: /^Show provider availability details:/i });

describe('AvailabilityCell behaviour', () => {
  it('opens the popover from the PlainButton trigger and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderCell();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('1 of 2 platforms linked')).toBeInTheDocument();
    await expectNoA11yViolations(baseElement);
  });

  it('copies a linked provider and shows the copied label', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue('copied');
    renderCell({ onCopy });
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Copy Spotify link' }));
    expect(onCopy).toHaveBeenCalledWith(
      '/r/midnight-signal?utm_source=spotify',
      expect.stringContaining('Spotify'),
      'provider-copy-release-1-spotify'
    );
    expect(
      await screen.findByRole('button', { name: 'Copied Spotify link' })
    ).toBeInTheDocument();
  });

  it('focuses the URL field, keeps typed input, validates and submits', async () => {
    const user = userEvent.setup();
    const onAddUrl = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderCell({ onAddUrl });
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: /Add link/ }));
    const input = screen.getByPlaceholderText('Paste URL...');
    expect(input).toHaveFocus();
    await user.type(input, 'https://example.com/x');
    rerender(
      <AvailabilityCell
        release={release}
        allProviders={['spotify', 'apple_music']}
        providerConfig={PROVIDER_CONFIG}
        onCopy={vi.fn()}
        onAddUrl={onAddUrl}
        isAddingUrl={false}
      />
    );
    expect(screen.getByPlaceholderText('Paste URL...')).toHaveValue(
      'https://example.com/x'
    );
    await user.click(screen.getByRole('button', { name: 'Confirm URL' }));
    expect(screen.getByText(/URL must be from/)).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText('Paste URL...'));
    await user.type(
      screen.getByPlaceholderText('Paste URL...'),
      'https://music.apple.com/us/album/x/1'
    );
    await user.click(screen.getByRole('button', { name: 'Confirm URL' }));
    expect(onAddUrl).toHaveBeenCalledWith(
      'release-1',
      'apple_music',
      'https://music.apple.com/us/album/x/1'
    );
  });

  it('cancels adding a URL', async () => {
    const user = userEvent.setup();
    renderCell();
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: /Add link/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel Adding URL' }));
    expect(screen.queryByPlaceholderText('Paste URL...')).toBeNull();
  });
});
