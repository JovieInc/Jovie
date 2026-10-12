import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioWaveformEditor } from '@/components/features/release/AudioWaveformEditor';
import { ReleaseAudioAssetPanel } from '@/components/features/release/ReleaseAudioAssetPanel';
import { AudioPreviewError } from '@/lib/audio/decode-waveform-peaks';

const blobUploadMock = vi.fn();
const decodeWaveformPeaksMock = vi.fn();

vi.mock('@vercel/blob/client', () => ({
  uploadPresigned: (...args: unknown[]) => blobUploadMock(...args),
}));

vi.mock('@/lib/audio/decode-waveform-peaks', async importOriginal => {
  const mod =
    await importOriginal<typeof import('@/lib/audio/decode-waveform-peaks')>();
  return {
    ...mod,
    decodeWaveformPeaks: (...args: unknown[]) =>
      decodeWaveformPeaksMock(...args),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ReleaseAudioAssetPanel', () => {
  const renderAttachedPreview = () =>
    render(
      <ReleaseAudioAssetPanel
        releaseId='release-1'
        releaseTitle='Take Me Over'
        previewUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
      />
    );
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    decodeWaveformPeaksMock.mockResolvedValue({
      peaks: [0.2, 0.8, 0.5],
      durationMs: 120_000,
    });
  });

  it('retries a failed waveform directly without replacing its attachment', async () => {
    const { decodeWaveformPeaks } = await vi.importActual<
      typeof import('@/lib/audio/decode-waveform-peaks')
    >('@/lib/audio/decode-waveform-peaks');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockRejectedValue(new TypeError('stream dropped')),
      })
    );
    decodeWaveformPeaksMock.mockImplementationOnce(decodeWaveformPeaks);
    const audioUrl = 'https://cdn.example.com/preview.mp3';
    render(<AudioWaveformEditor audioUrl={audioUrl} />);

    expect(
      await screen.findByTestId('audio-preview-unavailable')
    ).toHaveTextContent('Check your connection');
    fireEvent.click(await screen.findByTestId('audio-preview-retry'));
    await screen.findByTestId('audio-waveform-editor');

    expect(decodeWaveformPeaksMock).toHaveBeenCalledTimes(2);
    expect(decodeWaveformPeaksMock).toHaveBeenNthCalledWith(1, audioUrl);
    expect(decodeWaveformPeaksMock).toHaveBeenNthCalledWith(2, audioUrl);
    expect(screen.queryByTestId('audio-preview-unavailable')).toBeNull();
  });

  it('renders an upload dropzone when audio is missing', () => {
    render(
      <ReleaseAudioAssetPanel
        releaseId='release-1'
        releaseTitle='Take Me Over'
      />
    );

    expect(screen.getByTestId('release-audio-dropzone')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Upload audio for Take Me Over')
    ).toBeInTheDocument();
  });

  it('renders waveform editor when preview audio exists', async () => {
    render(
      <ReleaseAudioAssetPanel
        releaseId='release-1'
        releaseTitle='Take Me Over'
        previewUrl='https://cdn.example.com/preview.mp3'
        durationMs={120_000}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('release-audio-ready')).toBeInTheDocument();
    });
    expect(screen.getByTestId('audio-waveform-editor')).toBeInTheDocument();
    expect(
      screen.queryByTestId('release-audio-dropzone')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play waveform preview' })
    ).toBeInTheDocument();
  });

  it('shows a named-rule message and CTA for unsupported types', async () => {
    render(
      <ReleaseAudioAssetPanel
        releaseId='release-1'
        releaseTitle='Take Me Over'
      />
    );

    fireEvent.change(screen.getByLabelText('Upload audio for Take Me Over'), {
      target: {
        files: [new File(['not-audio'], 'notes.txt', { type: 'text/plain' })],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-rule')).toBeInTheDocument();
    });
    expect(screen.getByTestId('upload-rule').textContent).toMatch(
      /Supported types/i
    );
    expect(screen.getByTestId('upload-rejection-cta')).toHaveTextContent(
      /Choose another file/i
    );
    expect(screen.getByTestId('upload-request-type-cta')).toBeInTheDocument();
    expect(blobUploadMock).not.toHaveBeenCalled();
  });

  it('uploads audio and reveals the waveform editor', async () => {
    blobUploadMock.mockResolvedValue({
      url: 'https://cdn.example.com/uploaded.mp3',
      pathname: 'library/audio/uploaded.mp3',
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          previewUrl: 'https://cdn.example.com/uploaded.mp3',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReleaseAudioAssetPanel
        releaseId='release-1'
        releaseTitle='Take Me Over'
      />
    );

    fireEvent.change(screen.getByLabelText('Upload audio for Take Me Over'), {
      target: {
        files: [
          new File(['audio'], 'take-me-over.mp3', { type: 'audio/mpeg' }),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('release-audio-ready')).toBeInTheDocument();
    });
    expect(blobUploadMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/library/audio/confirm',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('shows "Audio preview unavailable" with retry when preview fetch fails', async () => {
    decodeWaveformPeaksMock.mockRejectedValueOnce(
      new AudioPreviewError('network')
    );

    renderAttachedPreview();
    await screen.findByTestId('audio-preview-unavailable');

    expect(screen.getByTestId('release-audio-ready')).toBeInTheDocument();
    expect(screen.queryByTestId('release-audio-dropzone')).toBeNull();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.getByText('Audio preview unavailable')).toBeInTheDocument();

    decodeWaveformPeaksMock.mockResolvedValueOnce({
      peaks: [0.2, 0.8],
      durationMs: 120_000,
    });
    fireEvent.click(screen.getByTestId('audio-preview-retry'));

    await screen.findByTestId('audio-waveform-editor');
    expect(decodeWaveformPeaksMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['removed', 404, 'File no longer available'],
    ['permission', 403, 'Preview not permitted'],
  ] as const)(
    'does not offer retry for %s sources',
    async (reason, status, title) => {
      decodeWaveformPeaksMock.mockRejectedValueOnce(
        new AudioPreviewError(reason, status)
      );

      renderAttachedPreview();
      await screen.findByTestId('audio-preview-unavailable');
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.queryByTestId('audio-preview-retry')).toBeNull();
    }
  );
});
