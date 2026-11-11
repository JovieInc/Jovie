import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  AlbumArtworkContextMenu,
  type ArtworkSize,
  buildArtworkSizes,
} from './AlbumArtworkContextMenu';

const { mutate, track } = vi.hoisted(() => ({
  mutate: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useArtworkDownloadMutation: () => ({ mutate }),
}));
vi.mock('@/lib/analytics', () => ({ track }));

const SIZES: ArtworkSize[] = buildArtworkSizes(
  { original: '/art/o.jpg', '1000': '/art/1000.jpg', '500': '/art/500.jpg' },
  null
);

function renderMenu(
  props: Partial<Parameters<typeof AlbumArtworkContextMenu>[0]> = {}
) {
  return render(
    <AlbumArtworkContextMenu
      title='The Deep End'
      sizes={SIZES}
      allowDownloads
      releaseId='release-1'
      {...props}
    >
      <div role='img' aria-label='The Deep End artwork' />
    </AlbumArtworkContextMenu>
  );
}

function openMenu() {
  fireEvent.contextMenu(
    screen.getByRole('img', { name: 'The Deep End artwork' })
  );
  return screen.findByRole('menu');
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('AlbumArtworkContextMenu', () => {
  it('orders presets largest first and falls back to the artwork URL', () => {
    expect(SIZES.map(size => size.key)).toEqual(['original', '1000', '500']);
    expect(buildArtworkSizes(null, '/art.jpg')).toEqual([
      { key: 'original', label: 'Original', url: '/art.jpg' },
    ]);
    expect(buildArtworkSizes(null, null)).toEqual([]);
  });

  it('downloads the chosen size and tracks it', async () => {
    const user = userEvent.setup();
    const { container } = renderMenu();

    // The menu portals to the body, so axe audits the trigger and the menu.
    const menu = await openMenu();
    expect(within(menu).getByText('Download Artwork')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(menu);
    await user.click(within(menu).getByRole('menuitem', { name: '500 × 500' }));

    expect(track).toHaveBeenCalledWith('artwork_download', {
      releaseId: 'release-1',
      size: '500',
    });
    expect(mutate).toHaveBeenCalledWith(
      { url: '/art/500.jpg', title: 'The Deep End', sizeKey: '500' },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it('opens the artwork in a new tab when the download fails', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    mutate.mockImplementationOnce((_input, options) => options.onError());
    renderMenu();

    fireEvent.click(
      within(await openMenu()).getByRole('menuitem', { name: 'Original' })
    );
    expect(open).toHaveBeenCalledWith('/art/o.jpg', '_blank');
  });

  it('offers only revert when downloads are off', async () => {
    const onRevert = vi.fn();
    renderMenu({ allowDownloads: false, canRevert: true, onRevert });

    const menu = await openMenu();
    await expectNoA11yViolations(menu);
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    expect(within(menu).queryByText('Download Artwork')).toBeNull();
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Revert to original artwork' })
    );
    expect(onRevert).toHaveBeenCalledTimes(1);
  });

  it('renders the artwork with no menu when nothing can be offered', async () => {
    const { container } = renderMenu({ sizes: [] });

    expect(container.querySelector('[data-state]')).toBeNull();
    fireEvent.contextMenu(
      screen.getByRole('img', { name: 'The Deep End artwork' })
    );
    expect(screen.queryByRole('menu')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('lists revert and every size inside a right-to-left page', async () => {
    render(
      <div dir='rtl' lang='ar'>
        <AlbumArtworkContextMenu
          title='The Deep End'
          sizes={buildArtworkSizes(
            { original: '/o', '1000': '/1', '500': '/5', '250': '/2' },
            null
          )}
          allowDownloads
          canRevert
          onRevert={vi.fn()}
        >
          <div role='img' aria-label='The Deep End artwork' />
        </AlbumArtworkContextMenu>
      </div>
    );

    const menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(5);
    await expectNoA11yViolations(menu);
  });
});
