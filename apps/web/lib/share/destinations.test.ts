import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReleaseShareContext } from './context';
import { launchPublicShareDestination } from './destinations';

const copyToClipboardMock = vi.fn();
const openMock = vi.fn();

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboardMock(...args),
}));

describe('public share destinations', () => {
  const context = buildReleaseShareContext({
    username: 'timwhite',
    slug: 'midnight-drive',
    title: 'Midnight Drive',
    artistName: 'Tim White',
    artworkUrl: 'https://example.com/artwork.png',
    pathname: '/timwhite/midnight-drive',
  });

  beforeEach(() => {
    copyToClipboardMock.mockReset();
    openMock.mockReset();
    vi.stubGlobal('open', openMock);
  });

  it('copies the tracked canonical url for copy link', async () => {
    copyToClipboardMock.mockResolvedValue(true);

    const result = await launchPublicShareDestination('copy_link', context);

    expect(result.status).toBe('success');
    expect(copyToClipboardMock).toHaveBeenCalledWith(
      expect.stringContaining('utm_source=share_menu')
    );
    expect(copyToClipboardMock).toHaveBeenCalledWith(
      expect.stringContaining('utm_content=copy_link')
    );
  });

  it('opens an X intent url with tracked params', async () => {
    openMock.mockReturnValue({});

    const result = await launchPublicShareDestination('twitter', context);
    const firstCallUrl = openMock.mock.calls[0]?.[0];

    expect(result.status).toBe('success');
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining('https://twitter.com/intent/tweet?'),
      '_blank',
      'noopener,noreferrer'
    );
    expect(typeof firstCallUrl).toBe('string');
    expect(decodeURIComponent(firstCallUrl as string)).toContain(
      'utm_source=twitter'
    );
  });

  it('copies fallback text when the X popup is blocked', async () => {
    copyToClipboardMock.mockResolvedValue(true);
    openMock.mockReturnValue(null);

    const result = await launchPublicShareDestination('twitter', context);

    expect(result.status).toBe('fallback');
    expect(result.helperText).toContain('Share text copied');
    expect(copyToClipboardMock).toHaveBeenCalledWith(
      expect.stringContaining('Listen to Midnight Drive by Tim White on Jovie')
    );
    expect(copyToClipboardMock).toHaveBeenCalledWith(
      expect.stringContaining('utm_source=twitter')
    );
  });

  it('falls back for Threads after copying prepared text', async () => {
    copyToClipboardMock.mockResolvedValue(true);
    openMock.mockReturnValue({});

    const result = await launchPublicShareDestination('threads', context);

    expect(result.status).toBe('fallback');
    expect(result.helperText).toContain('Threads text copied');
    expect(copyToClipboardMock).toHaveBeenCalledWith(
      expect.stringContaining('Listen to Midnight Drive by Tim White on Jovie')
    );
  });

  describe('instagram_story native share', () => {
    const fetchMock = vi.fn();
    const shareMock = vi.fn();
    const canShareMock = vi.fn();

    beforeEach(() => {
      fetchMock.mockReset();
      shareMock.mockReset();
      canShareMock.mockReset();
      fetchMock.mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['png'], { type: 'image/png' }),
      });
      canShareMock.mockReturnValue(true);
      vi.stubGlobal('fetch', fetchMock);
      vi.stubGlobal('navigator', {
        share: shareMock,
        canShare: canShareMock,
      });
    });

    it('returns cancelled without downloading when the user dismisses the share sheet', async () => {
      shareMock.mockRejectedValue(new DOMException('cancelled', 'AbortError'));

      const result = await launchPublicShareDestination(
        'instagram_story',
        context
      );

      expect(result.status).toBe('cancelled');
      expect(result.helperText).toBeUndefined();
      // Only the File-building fetch ran; no fallback download was attempted.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the download fallback when sharing fails for another reason', async () => {
      shareMock.mockRejectedValue(new Error('share failed'));

      const result = await launchPublicShareDestination(
        'instagram_story',
        context
      );

      expect(result.status).toBe('fallback');
      // Second fetch is the fallback asset download attempt.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
