import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryRelationshipView } from '@/lib/library/track-drawer-types';
import { YouTubeMerchRelationshipEditor } from './YouTubeAssetDrawerPanels';

const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/feedback', () => ({ toast: feedback }));

const profileId = '11111111-1111-4111-8111-111111111111';
const merchCardId = '22222222-2222-4222-8222-222222222222';
const merchProducts = [{ id: merchCardId, title: 'Tour hoodie' }];
const relationship: LibraryRelationshipView = {
  id: 'relationship-1',
  kind: 'features_merch',
  subjectType: 'youtube_video',
  subjectId: 'video + /?&=雪',
  objectType: 'merch_product',
  objectId: merchCardId,
  status: 'active',
  createdAt: '2026-09-03T00:00:00.000Z',
};
const props = {
  profileId,
  videoId: relationship.subjectId,
  merchProducts,
  relationships: [] as readonly LibraryRelationshipView[],
  disabled: false,
};

describe('YouTubeMerchRelationshipEditor', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an unsubmitted merch choice when switching videos with the same relationships', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<YouTubeMerchRelationshipEditor {...props} />);
    await user.selectOptions(screen.getByRole('combobox'), merchCardId);
    expect(screen.getByRole('button', { name: 'Tag' })).toBeEnabled();

    rerender(<YouTubeMerchRelationshipEditor {...props} videoId='video-2' />);

    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Tag' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resets the choice and updates tags when relationships refresh', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<YouTubeMerchRelationshipEditor {...props} />);
    await user.selectOptions(screen.getByRole('combobox'), merchCardId);

    rerender(
      <YouTubeMerchRelationshipEditor
        {...props}
        relationships={[relationship]}
      />
    );
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    rerender(<YouTubeMerchRelationshipEditor {...props} relationships={[]} />);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Tag' })).toBeDisabled();
  });

  it('removes a tag using encoded query params and no body, then makes merch available again', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    render(
      <YouTubeMerchRelationshipEditor
        {...props}
        relationships={[relationship]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(String(input), 'https://example.com');
    expect(url.pathname).toBe('/api/library/relationships');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      creatorProfileId: profileId,
      videoId: props.videoId,
      merchCardId,
    });
    expect(init).toEqual({ method: 'DELETE' });
    expect(await screen.findByRole('combobox')).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Remove' })
    ).not.toBeInTheDocument();
    expect(feedback.success).toHaveBeenCalledWith('Merch tag removed');
  });

  it('keeps POST identifiers in JSON and clears the choice after tagging', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ relationship }));
    render(<YouTubeMerchRelationshipEditor {...props} />);

    await user.selectOptions(screen.getByRole('combobox'), merchCardId);
    await user.click(screen.getByRole('button', { name: 'Tag' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/library/relationships', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        creatorProfileId: profileId,
        videoId: props.videoId,
        merchCardId,
      }),
    });
    expect(await screen.findByRole('button', { name: 'Remove' })).toBeEnabled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(feedback.success).toHaveBeenCalledWith('Merch tagged in video');
  });

  it.each(['server', 'network'])(
    'retains a tag after a %s failure and allows retry',
    async failure => {
      const user = userEvent.setup();
      if (failure === 'server') {
        fetchMock.mockResolvedValueOnce(
          Response.json({ error: 'Try again' }, { status: 503 })
        );
      } else {
        fetchMock.mockRejectedValueOnce(new Error('Try again'));
      }
      fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
      render(
        <YouTubeMerchRelationshipEditor
          {...props}
          relationships={[relationship]}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Remove' }));

      await waitFor(() =>
        expect(feedback.error).toHaveBeenCalledWith('Try again')
      );
      expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
      expect(feedback.success).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      expect(await screen.findByRole('combobox')).toHaveValue('');
      expect(feedback.success).toHaveBeenCalledWith('Merch tag removed');
    }
  );

  it('disables mutation controls while deletion is pending', async () => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    fetchMock.mockReturnValue(promise);
    render(
      <YouTubeMerchRelationshipEditor
        {...props}
        relationships={[relationship]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    resolve(Response.json({ ok: true }));
    expect(await screen.findByRole('combobox')).toBeEnabled();
  });

  it('prevents a disabled editor from removing tags', () => {
    render(
      <YouTubeMerchRelationshipEditor
        {...props}
        relationships={[relationship]}
        disabled
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
