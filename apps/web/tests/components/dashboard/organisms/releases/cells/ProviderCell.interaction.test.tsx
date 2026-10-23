import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AvailabilityCell } from '@/features/dashboard/organisms/releases/cells/AvailabilityCell';
import { ProviderCell } from '@/features/dashboard/organisms/releases/cells/ProviderCell';
import { NotFoundCopyButton } from '@/features/dashboard/organisms/releases/components/NotFoundCopyButton';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));

describe('ProviderCell actions', () => {
  const release: ReleaseViewModel = {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Midnight Signal',
    releaseDate: '2026-01-01',
    artworkUrl: 'https://example.com/art.jpg',
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

  it('does not bubble open/copy clicks to parent row handlers', () => {
    const parentClick = vi.fn();
    const onCopy = vi.fn().mockResolvedValue('copied');
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);

    render(
      <TooltipProvider>
        <table>
          <tbody>
            <tr onClick={parentClick}>
              <td>
                <ProviderCell
                  release={release}
                  provider={'spotify' as ProviderKey}
                  config={{ label: 'Spotify', accent: '#22c55e' }}
                  onCopy={onCopy}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </TooltipProvider>
    );

    const [openButton, copyButton] = screen.getAllByRole('button');
    fireEvent.click(openButton);
    fireEvent.click(copyButton);

    expect(parentClick).not.toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith(
      'https://open.spotify.com/track/abc',
      '_blank',
      'noopener,noreferrer'
    );
    expect(onCopy).toHaveBeenCalledTimes(1);

    openSpy.mockRestore();
  });

  it('keeps provider copy icon swaps opacity-only', () => {
    const sourceFiles = [
      'components/features/dashboard/organisms/releases/cells/ProviderCell.tsx',
      'components/features/dashboard/organisms/releases/components/ProviderCopyButton.tsx',
      'components/features/dashboard/organisms/releases/components/NotFoundCopyButton.tsx',
    ];

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(resolve(process.cwd(), sourceFile), 'utf8');

      expect(source).not.toMatch(/\btransition-all\b/);
      expect(source).not.toMatch(/\bscale-(?:50|95|100|105|110|125)\b/);
      expect(source).toContain('transition-opacity');
      // Ion tokens only: the copied feedback wears the success token, never
      // a raw emerald/amber palette color.
      expect(source).not.toMatch(/emerald-|amber-|orange-|cyan-/);
    }

    // Explicit per-file token reads for the coverage-via receipts on the two
    // copy buttons (statically resolvable paths).
    expect(
      readFileSync(
        resolve(
          process.cwd(),
          'components/features/dashboard/organisms/releases/components/ProviderCopyButton.tsx'
        ),
        'utf8'
      )
    ).toContain("'border-success/15 bg-success/10 text-success'");
    expect(
      readFileSync(
        resolve(
          process.cwd(),
          'components/features/dashboard/organisms/releases/components/NotFoundCopyButton.tsx'
        ),
        'utf8'
      )
    ).toContain("'border-success/15 bg-success/10 text-success'");
  });
});

describe('Ion-token feedback on availability surfaces', () => {
  it('renders the manual-status ring and copied feedback on tokens inside the availability popover', async () => {
    const onCopy = vi.fn().mockResolvedValue('copied');
    const manualRelease: ReleaseViewModel = {
      ...release,
      providers: [
        {
          key: 'spotify' as ProviderKey,
          url: 'https://open.spotify.com/track/abc',
          path: '/r/midnight-signal?utm_source=spotify',
          label: 'Spotify',
          isPrimary: true,
          source: 'manual',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    render(
      <TooltipProvider>
        <AvailabilityCell
          release={manualRelease}
          allProviders={['spotify']}
          providerConfig={{ spotify: { label: 'Spotify', accent: '#1DB954' } }}
          onCopy={onCopy}
        />
      </TooltipProvider>
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Show Provider Availability Details' })
    );

    const statusDot = document.querySelector('span.ring-2');
    expect(statusDot).not.toBeNull();
    expect(statusDot?.className).toContain('ring-quaternary-token/40');
    expect(statusDot?.className).not.toContain('amber');

    await user.click(screen.getByRole('button', { name: 'Copy Spotify link' }));
    await waitFor(() => {
      const copied = screen.getByRole('button', {
        name: 'Copied Spotify link',
      });
      expect(copied.className).toContain('text-success');
      expect(copied.className).not.toMatch(/emerald|amber/);
    });
  });

  it('renders the not-found copy feedback on the success token when copied', () => {
    render(
      <NotFoundCopyButton
        testId='copy-not-found-release-1'
        releaseTitle='Midnight Signal'
        smartLinkPath='/r/midnight-signal'
        isCopied
        onCopy={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const button = screen.getByRole('button');
    expect(button.className).toContain('border-success/15');
    expect(button.className).toContain('bg-success/10');
    expect(button.className).toContain('text-success');
    expect(button.className).not.toMatch(/emerald|amber/);
  });
});
