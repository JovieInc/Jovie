import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { PressPhoto } from '@/types/press-photos';
import { AboutSection } from './AboutSection';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

const pressPhoto: PressPhoto = {
  id: 'press-1',
  blobUrl: 'https://cdn.example.com/press-1.avif',
  smallUrl: null,
  mediumUrl: 'https://cdn.example.com/press-1-medium.avif',
  largeUrl: null,
  originalFilename: 'tim-white-press.avif',
  width: 1200,
  height: 1500,
  status: 'ready',
  sortOrder: 0,
};

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AboutSection certificate', () => {
  it('downloads a press photo through a blob link when the fetch succeeds', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(['image'])),
    });
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:press-1');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const { container } = render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        pressPhotos={[pressPhoto]}
        allowPhotoDownloads
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Download tim-white-press.avif' })
    );

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(pressPhoto.blobUrl, {
      signal: expect.any(AbortSignal),
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:press-1');
    await expectNoA11yViolations(container);
  });

  it('opens the original photo in a new tab when the download fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const openSpy = vi.spyOn(globalThis, 'open').mockReturnValue(null);

    render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        pressPhotos={[pressPhoto]}
        allowPhotoDownloads
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Download tim-white-press.avif' })
    );

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        pressPhoto.blobUrl,
        '_blank',
        'noopener,noreferrer'
      )
    );
  });

  it('disables the download control for a photo without a source file', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        pressPhotos={[{ ...pressPhoto, blobUrl: null }]}
        allowPhotoDownloads
      />
    );

    const download = screen.getByRole('button', {
      name: 'Download tim-white-press.avif',
    });
    expect(download).toBeDisabled();
    await user.click(download);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hides press photos when downloads are not allowed and stays axe-clean', async () => {
    const { container } = render(
      <AboutSection
        artist={PROFILE_STORY_ARTIST}
        pressPhotos={[pressPhoto]}
        allowPhotoDownloads={false}
      />
    );

    expect(
      screen.queryByTestId('profile-about-press-photos')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Producer, songwriter, and after-hours romantic.')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows the empty message when the profile has nothing to show', async () => {
    const { container } = render(
      <AboutSection
        artist={{
          ...PROFILE_STORY_ARTIST,
          tagline: undefined,
          location: null,
        }}
      />
    );

    expect(screen.getByText('No information available yet.')).toHaveClass(
      'text-on-media/50'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left content readable and axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AboutSection
          artist={{
            ...PROFILE_STORY_ARTIST,
            tagline: 'منتج وكاتب أغانٍ يصنع موسيقى الليل المتأخر.',
            location: 'دبي',
            hometown: 'Saint Petersburg, Florida',
            active_since_year: 2009,
          }}
          genres={['هاوس', 'melodic techno']}
        />
      </div>
    );

    expect(screen.getByText('دبي')).toBeVisible();
    expect(screen.getByText('From Saint Petersburg, Florida')).toBeVisible();
    expect(screen.getByText('Active since 2009')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
