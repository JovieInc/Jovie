import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));

import {
  type BuildReleaseActionsOptions,
  buildReleaseActions,
} from './release-actions';

/**
 * Renders the built items the way a menu would: one button per action, with a
 * labelled group per submenu, so each handler is exercised by a real click.
 */
function ActionList({ items }: { readonly items: ContextMenuItemType[] }) {
  return (
    <ul>
      {items.map((item, index) => {
        if ('type' in item)
          return <li key={`separator-${index}`} aria-hidden />;
        if ('items' in item && item.items) {
          return (
            <li key={item.id}>
              <fieldset data-testid={`submenu-${item.id}`}>
                <legend>{item.label}</legend>
                <ActionList items={item.items} />
              </fieldset>
            </li>
          );
        }
        return (
          <li key={item.id}>
            <button
              type='button'
              disabled={'disabled' in item ? item.disabled : false}
              data-destructive={
                'destructive' in item && item.destructive ? 'true' : undefined
              }
              onClick={'onClick' in item ? item.onClick : undefined}
            >
              {item.icon}
              {item.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const release: ReleaseViewModel = {
  id: 'release-1',
  profileId: 'profile-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  status: 'draft',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-10-21',
  totalTracks: 1,
  providers: [
    {
      key: 'spotify',
      url: 'https://open.spotify.com/album/1',
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00.000Z',
      label: 'Spotify',
      path: '/album/1',
      isPrimary: true,
    },
  ],
  spotifyPopularity: null,
  smartLinkPath: '/r/skyline-dreams',
  previewUrl: null,
  primaryIsrc: 'USABC2600001',
  upc: null,
};

function renderActions(overrides: Partial<BuildReleaseActionsOptions> = {}) {
  const onEdit = vi.fn();
  const onCopy = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ActionList
      items={buildReleaseActions({ release, onEdit, onCopy, ...overrides })}
    />
  );
  return { ...view, onEdit, onCopy };
}

// These render full tables and Radix menus; a loaded CI runner needs more than
// the default five seconds.
vi.setConfig({ testTimeout: 20_000 });

describe('release actions certificate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('edits, copies the smart link and opens the only provider', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    const { container, onEdit, onCopy } = renderActions();

    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Edit Release Links' })
    );
    expect(onEdit).toHaveBeenCalledWith(release);

    await user.click(screen.getByRole('button', { name: 'Copy Smart Link' }));
    expect(onCopy).toHaveBeenCalledWith(
      '/r/skyline-dreams',
      'Skyline Dreams smart link',
      'smart-link-copy-release-1'
    );

    await user.click(screen.getByRole('button', { name: 'Open in Spotify' }));
    expect(open).toHaveBeenCalledWith(
      'https://open.spotify.com/album/1',
      '_blank',
      'noopener,noreferrer'
    );
    expect(screen.queryByRole('button', { name: 'Delete Release' })).toBeNull();
    expect(screen.queryByTestId('submenu-release-status')).toBeNull();
  });

  it('copies a tracked link as a path relative to the app origin', async () => {
    const user = userEvent.setup();
    const { onCopy } = renderActions({ artistName: 'Sasha Waves' });

    const tracked = screen.getByTestId('submenu-tracked-share-submenu');
    await user.click(within(tracked).getAllByRole('button')[0]);
    expect(onCopy).toHaveBeenCalledTimes(1);
    const [path, label, testId] = onCopy.mock.calls[0];
    expect(path).toMatch(/^\/r\/skyline-dreams\?.*utm_source=/);
    expect(label).toEqual(expect.any(String));
    expect(testId).toMatch(/^tracked-share-.+-release-1$/);
  });

  it('wires every optional capability to its own action', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    const handlers = {
      onDelete: vi.fn(),
      onCopyQrCode: vi.fn(),
      onGenerateAlbumArt: vi.fn(),
      onGeneratePitch: vi.fn(),
      onChangeStatus: vi.fn(),
    };
    const full: ReleaseViewModel = {
      ...release,
      hasVideoLinks: true,
      lyrics: '  City lights below me  ',
      upc: '123456789012',
      providers: [
        ...release.providers,
        {
          key: 'apple_music',
          url: 'https://music.apple.com/album/1',
          source: 'ingested',
          updatedAt: '2026-01-01T00:00:00.000Z',
          label: 'Apple Music',
          path: '/album/1',
          isPrimary: false,
        },
      ],
    };
    const { container, onCopy } = renderActions({
      release: full,
      canGenerateAlbumArt: true,
      ...handlers,
    });

    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Generate Album Art' })
    );
    expect(handlers.onGenerateAlbumArt).toHaveBeenCalledWith(full);
    await user.click(screen.getByRole('button', { name: 'Generate Pitch' }));
    expect(handlers.onGeneratePitch).toHaveBeenCalledWith(full);
    await user.click(screen.getByRole('button', { name: 'Copy QR Code' }));
    expect(handlers.onCopyQrCode).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: 'Copy Use Sound Link' })
    );
    expect(onCopy).toHaveBeenLastCalledWith(
      '/r/skyline-dreams/sounds',
      'Skyline Dreams sounds link',
      'sounds-link-copy-release-1'
    );

    const status = screen.getByTestId('submenu-release-status');
    expect(within(status).getByText('Status: Draft')).toBeInTheDocument();
    expect(
      within(status).getByRole('button', { name: 'Draft' })
    ).toBeDisabled();
    await user.click(within(status).getByRole('button', { name: 'Released' }));
    expect(handlers.onChangeStatus).toHaveBeenCalledWith(full, 'released');

    const openIn = screen.getByTestId('submenu-open-release');
    await user.click(
      within(openIn).getByRole('button', { name: 'Open in Apple Music' })
    );
    expect(open).toHaveBeenCalledWith(
      'https://music.apple.com/album/1',
      '_blank',
      'noopener,noreferrer'
    );

    const metadata = screen.getByTestId('submenu-copy-metadata');
    expect(within(metadata).getAllByRole('button')).toHaveLength(4);

    const destroy = screen.getByRole('button', { name: 'Delete Release' });
    expect(destroy).toHaveAttribute('data-destructive', 'true');
    await user.click(destroy);
    expect(handlers.onDelete).toHaveBeenCalledWith('release-1');
  });

  it('leaves out album art generation unless the capability is granted', () => {
    renderActions({ onGenerateAlbumArt: vi.fn() });
    expect(
      screen.queryByRole('button', { name: 'Generate Album Art' })
    ).toBeNull();
  });

  it.each([
    ['cap', 'Smart link (Pro)'],
    ['scheduled', 'Scheduled smart link (Pro)'],
  ] as const)(
    'disables a %s-locked smart link and hides sharing',
    async (reason, label) => {
      const user = userEvent.setup();
      const { container, onCopy } = renderActions({
        isSmartLinkLocked: id => id === 'release-1',
        getSmartLinkLockReason: () => reason,
        onCopyQrCode: vi.fn(),
      });

      const locked = screen.getByRole('button', { name: label });
      expect(locked).toBeDisabled();
      await user.click(locked);
      expect(onCopy).not.toHaveBeenCalled();
      expect(screen.queryByTestId('submenu-share-link')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Copy QR Code' })).toBeNull();
      await expectNoA11yViolations(container);
    }
  );
});
