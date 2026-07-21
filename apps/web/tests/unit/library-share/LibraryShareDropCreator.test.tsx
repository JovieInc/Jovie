import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryShareDropCreator } from '@/components/features/library-share/LibraryShareDropCreator';

vi.mock('@/components/feedback', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('LibraryShareDropCreator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lets artists curate a multi-asset press kit set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        shareUrl: 'https://jov.ie/drop/multi-token',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(
      <LibraryShareDropCreator
        releaseIds={['release-1']}
        candidateAssets={[
          { id: 'release-1', title: 'Midnight Drive' },
          { id: 'release-2', title: 'Sunrise Loop' },
          { id: 'release-3', title: 'Afterhours' },
        ]}
        defaultTitle='Label Review Pack'
      />
    );

    fireEvent.click(screen.getByTestId('library-share-create-trigger'));

    expect(
      screen.getByTestId('library-share-asset-picker')
    ).toBeInTheDocument();
    expect(screen.getByTestId('library-share-asset-release-1')).toBeChecked();
    expect(
      screen.getByTestId('library-share-asset-release-2')
    ).not.toBeChecked();

    fireEvent.click(screen.getByTestId('library-share-asset-release-2'));
    fireEvent.click(screen.getByTestId('library-share-comment-toggle'));
    fireEvent.change(screen.getByTestId('library-share-comment-input'), {
      target: { value: 'For A&R only' },
    });
    fireEvent.click(screen.getByTestId('library-share-create-submit'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/library/share-drops',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    ) as {
      readonly releaseIds: readonly string[];
      readonly message: string | null;
      readonly downloadsEnabled: boolean;
    };

    expect(body.releaseIds).toEqual(['release-1', 'release-2']);
    expect(body.message).toBe('For A&R only');
    expect(body.downloadsEnabled).toBe(true);
    expect(
      screen.getByTestId('library-share-created-panel')
    ).toBeInTheDocument();
  });

  it('hides the asset picker for a single-release drop', () => {
    render(
      <LibraryShareDropCreator
        releaseIds={['release-1']}
        defaultTitle='Single Drop'
      />
    );

    fireEvent.click(screen.getByTestId('library-share-create-trigger'));

    expect(
      screen.queryByTestId('library-share-asset-picker')
    ).not.toBeInTheDocument();
    // Comment field is reserved while toggle starts off (layout-shift contract).
    expect(screen.getByTestId('library-share-comment-input')).toBeDisabled();
  });

  it('refuses to deselect the last selected asset', () => {
    render(
      <LibraryShareDropCreator
        releaseIds={['release-1']}
        candidateAssets={[
          { id: 'release-1', title: 'Midnight Drive' },
          { id: 'release-2', title: 'Sunrise Loop' },
        ]}
        defaultTitle='Label Review Pack'
      />
    );

    fireEvent.click(screen.getByTestId('library-share-create-trigger'));
    expect(screen.getByTestId('library-share-asset-release-1')).toBeChecked();

    fireEvent.click(screen.getByTestId('library-share-asset-release-1'));
    expect(screen.getByTestId('library-share-asset-release-1')).toBeChecked();
    expect(
      screen.getByTestId('library-share-create-submit')
    ).not.toBeDisabled();
  });

  it('omits comment text when the comment toggle is off', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        shareUrl: 'https://jov.ie/drop/single-token',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(
      <LibraryShareDropCreator
        releaseIds={['release-1']}
        defaultTitle='Single Drop'
      />
    );

    fireEvent.click(screen.getByTestId('library-share-create-trigger'));
    fireEvent.click(screen.getByTestId('library-share-comment-toggle'));
    fireEvent.change(screen.getByTestId('library-share-comment-input'), {
      target: { value: 'Should not ship' },
    });
    // Turning the toggle off again must drop the note from the create payload.
    fireEvent.click(screen.getByTestId('library-share-comment-toggle'));
    expect(screen.getByTestId('library-share-comment-input')).toBeDisabled();
    fireEvent.click(screen.getByTestId('library-share-create-submit'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    ) as { readonly message: string | null };

    expect(body.message).toBeNull();
  });
});
