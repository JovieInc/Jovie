import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  YOUTUBE_THUMBNAIL_DEVICE_HEADER,
  YOUTUBE_THUMBNAIL_PREVIEW_ENDPOINT,
  type YoutubeThumbnailPreviewResponse,
  YoutubeThumbnailPasteForm,
} from './YoutubeThumbnailPasteForm';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const READY: YoutubeThumbnailPreviewResponse = {
  ok: true,
  channel: { id: 'UC123', title: 'Tim White', handle: 'itstimwhite' },
  mode: 'redo',
  remaining: 2,
  items: [
    {
      videoId: 'a1',
      title: 'Video one',
      beforeUrl: 'https://i.ytimg.com/vi/a1/maxresdefault.jpg',
      afterUrl: 'https://blob.example/a1.jpg',
    },
    {
      videoId: 'b2',
      title: 'Video two',
      beforeUrl: 'https://i.ytimg.com/vi/b2/maxresdefault.jpg',
      afterUrl: 'https://blob.example/b2.jpg',
    },
    {
      videoId: 'c3',
      title: 'Video three',
      beforeUrl: 'https://i.ytimg.com/vi/c3/maxresdefault.jpg',
      afterUrl: null,
    },
  ],
};

describe('YoutubeThumbnailPasteForm', () => {
  it('posts the pasted channel with a device header and renders three before/after items', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(READY));
    const user = userEvent.setup();

    render(
      <YoutubeThumbnailPasteForm applyHref='/signup?x=1' fetchImpl={fetchImpl} />
    );

    const submit = screen.getByTestId('youtube-thumbnails-primary-cta');
    expect(submit).toBeDisabled();

    await user.type(
      screen.getByTestId('youtube-thumbnails-channel-input'),
      '@itstimwhite'
    );
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(screen.getByTestId('youtube-thumbnails-results')).toBeVisible()
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(YOUTUBE_THUMBNAIL_PREVIEW_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ channel: '@itstimwhite' });
    const headers = init.headers as Record<string, string>;
    expect(headers[YOUTUBE_THUMBNAIL_DEVICE_HEADER]).toBeTruthy();

    expect(
      screen.getAllByTestId('youtube-thumbnails-result-item')
    ).toHaveLength(3);
    expect(screen.getByText('2 free redos left.')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Redo coming soon' })).toBeVisible();
    expect(screen.getByTestId('youtube-thumbnails-apply-cta')).toHaveAttribute(
      'href',
      '/signup?x=1'
    );
  });

  it('explains preview-only mode when redos are not open yet', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ...READY, mode: 'preview_only', remaining: null })
      );
    const user = userEvent.setup();

    render(<YoutubeThumbnailPasteForm applyHref='/signup' fetchImpl={fetchImpl} />);
    await user.type(
      screen.getByTestId('youtube-thumbnails-channel-input'),
      'youtube.com/@itstimwhite'
    );
    await user.click(screen.getByTestId('youtube-thumbnails-primary-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('youtube-thumbnails-results')).toHaveAttribute(
        'data-mode',
        'preview_only'
      )
    );
    expect(
      screen.getByText('Redos open soon. These are the three we would start with.')
    ).toBeVisible();
    expect(screen.queryByText(/free redos left/)).toBeNull();
  });

  it.each([
    [400, 'invalid_channel', 'We could not find that channel. Paste the @handle or the channel link.'],
    [400, 'no_videos', 'That channel has no public videos yet.'],
    [429, 'visitor_limit', 'You have seen your three. Connect to keep going.'],
    [429, 'cooldown', 'One at a time. Give it a minute.'],
    [403, 'datacenter', 'That network is blocked. Try again from a normal connection.'],
    [503, 'youtube_data_api_unavailable', 'YouTube lookups are paused right now. Try again shortly.'],
    [500, 'internal_error', 'Something broke on our side. Try again in a minute.'],
  ])('maps %s/%s to plain-language copy', async (status, code, message) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: false, code }, status));
    const user = userEvent.setup();

    render(<YoutubeThumbnailPasteForm applyHref='/signup' fetchImpl={fetchImpl} />);
    await user.type(
      screen.getByTestId('youtube-thumbnails-channel-input'),
      'nobody'
    );
    await user.click(screen.getByTestId('youtube-thumbnails-primary-cta'));

    await waitFor(() =>
      expect(screen.getByTestId('youtube-thumbnails-error')).toHaveTextContent(
        message
      )
    );
    expect(screen.queryByTestId('youtube-thumbnails-results')).toBeNull();
  });
});
