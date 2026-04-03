import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatAlbumArtCard } from '@/components/jovie/components/ChatAlbumArtCard';

const applyGeneratedReleaseAlbumArt = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    unoptimized: _unoptimized,
    ...props
  }: React.ComponentProps<'img'> & { fill?: boolean }) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  applyGeneratedReleaseAlbumArt: (...args: unknown[]) =>
    applyGeneratedReleaseAlbumArt(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock('@jovie/ui', () => ({
  SimpleTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('ChatAlbumArtCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies the selected option and shows matching-template summary copy', async () => {
    applyGeneratedReleaseAlbumArt.mockResolvedValue({
      artworkUrl: 'https://example.com/final.png',
    });

    render(
      <ChatAlbumArtCard
        state='success'
        releaseId='release-1'
        sessionId='session-1'
        releaseTitle='Tokyo Drift'
        usedMatchingTemplate
        quotaRemaining={0}
        options={[
          { id: 'option-1', previewUrl: 'https://example.com/one.png' },
          { id: 'option-2', previewUrl: 'https://example.com/two.png' },
        ]}
      />
    );

    expect(
      screen.getByText('Using matching release design • No runs left')
    ).toBeInTheDocument();

    const previews = screen.getAllByAltText('Generated album art preview');
    fireEvent.click(previews[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Apply To Release' }));

    await waitFor(() => {
      expect(applyGeneratedReleaseAlbumArt).toHaveBeenCalledWith({
        releaseId: 'release-1',
        sessionId: 'session-1',
        optionId: 'option-2',
      });
    });

    expect(toastSuccess).toHaveBeenCalledWith(
      'Album art applied. The release drawer will reflect it.'
    );
    expect(screen.getByRole('button', { name: 'Applied' })).toBeDisabled();
  });

  it('resets selection and apply state when a new generation session arrives', async () => {
    applyGeneratedReleaseAlbumArt.mockResolvedValue({
      artworkUrl: 'https://example.com/final.png',
    });

    const { rerender } = render(
      <ChatAlbumArtCard
        state='success'
        releaseId='release-1'
        sessionId='session-1'
        releaseTitle='Tokyo Drift'
        options={[
          { id: 'option-1', previewUrl: 'https://example.com/one.png' },
          { id: 'option-2', previewUrl: 'https://example.com/two.png' },
        ]}
      />
    );

    const initialPreviews = screen.getAllByAltText(
      'Generated album art preview'
    );
    fireEvent.click(initialPreviews[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Apply To Release' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Applied' })).toBeDisabled();
    });

    rerender(
      <ChatAlbumArtCard
        state='success'
        releaseId='release-1'
        sessionId='session-2'
        releaseTitle='Tokyo Drift'
        brandKitName='Armada'
        quotaRemaining={2}
        options={[
          { id: 'option-3', previewUrl: 'https://example.com/three.png' },
          { id: 'option-4', previewUrl: 'https://example.com/four.png' },
        ]}
      />
    );

    expect(
      screen.getByText('Series template: Armada • 2 runs left')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply To Release' })
    ).toBeEnabled();
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Apply To Release' }));

    await waitFor(() => {
      expect(applyGeneratedReleaseAlbumArt).toHaveBeenLastCalledWith({
        releaseId: 'release-1',
        sessionId: 'session-2',
        optionId: 'option-3',
      });
    });
  });
});
