import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({ track: mocks.track }));
vi.mock('@/lib/sentry/client-lite', () => ({
  captureException: mocks.captureException,
}));

import { ProfilePhotoContextMenu } from './ProfilePhotoContextMenu';

const SIZES = [
  { key: 'original', label: 'Original', url: 'https://cdn.example.com/a.avif' },
  { key: '400', label: '400 × 400', url: 'https://cdn.example.com/a-400' },
];

// The trigger is asChild, so the photo must be a DOM element that takes the
// trigger's props, as it is in the product.
const AVATAR = (
  <div data-testid='profile-photo' role='img' aria-label='Tim White photo' />
);

function renderMenu(props: Partial<{ allowDownloads: boolean }> = {}) {
  return render(
    <main>
      <ProfilePhotoContextMenu
        name='Tim White'
        handle='Tim White!'
        sizes={SIZES}
        allowDownloads={props.allowDownloads ?? true}
      >
        {AVATAR}
      </ProfilePhotoContextMenu>
    </main>
  );
}

describe('ProfilePhotoContextMenu', () => {
  const clickSpy = vi.fn();

  beforeEach(() => {
    mocks.track.mockReset();
    mocks.captureException.mockReset();
    clickSpy.mockReset();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clickSpy(this.download, this.href);
    });
    URL.createObjectURL = vi.fn(() => 'blob:profile-photo');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads a size with a sanitized filename and the served extension', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob(['x']),
        headers: new Headers({ 'content-type': 'image/png' }),
      }))
    );
    const { container } = renderMenu();

    fireEvent.contextMenu(screen.getByTestId('profile-photo'));
    expect(await screen.findByText('Download Profile Photo')).toBeVisible();
    // The menu portals to the body, so axe audits it on its own too.
    await expectNoA11yViolations(screen.getByRole('menu'));
    await user.click(screen.getByRole('menuitem', { name: '400 × 400' }));

    await waitFor(() =>
      expect(clickSpy).toHaveBeenCalledWith(
        'tim-white-400.png',
        'blob:profile-photo'
      )
    );
    expect(mocks.track).toHaveBeenCalledWith('profile_photo_download', {
      size: '400',
    });
    expect(fetch).toHaveBeenCalledWith(SIZES[1].url, {
      signal: expect.any(AbortSignal),
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile-photo');
    await expectNoA11yViolations(container);
  });

  it('names the original download without a size suffix', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob(['x']),
        headers: new Headers({ 'content-type': 'image/jpeg' }),
      }))
    );
    renderMenu();

    fireEvent.contextMenu(screen.getByTestId('profile-photo'));
    await user.click(await screen.findByRole('menuitem', { name: 'Original' }));

    await waitFor(() =>
      expect(clickSpy).toHaveBeenCalledWith(
        'tim-white.jpg',
        'blob:profile-photo'
      )
    );
  });

  it('reports a failed download and opens the image in a new tab instead', async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 }))
    );
    renderMenu();

    fireEvent.contextMenu(screen.getByTestId('profile-photo'));
    await user.click(
      await screen.findByRole('menuitem', { name: '400 × 400' })
    );

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(SIZES[1].url, '_blank')
    );
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'HTTP 503' }),
      {
        tags: { feature: 'profile_photo_download' },
        extra: { sizeKey: '400', url: SIZES[1].url },
      }
    );
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('renders only the photo when downloads are off or there are no sizes', async () => {
    const { container } = renderMenu({ allowDownloads: false });

    fireEvent.contextMenu(screen.getByTestId('profile-photo'));
    expect(
      screen.queryByText('Download Profile Photo')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Tim White photo' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps the open menu axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <main dir='rtl' lang='ar'>
        <ProfilePhotoContextMenu
          name='Tim White'
          handle=''
          sizes={SIZES}
          allowDownloads
        >
          {AVATAR}
        </ProfilePhotoContextMenu>
      </main>
    );

    fireEvent.contextMenu(screen.getByTestId('profile-photo'));
    expect(await screen.findAllByRole('menuitem')).toHaveLength(2);
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(screen.getByRole('menu'));
  });
});
