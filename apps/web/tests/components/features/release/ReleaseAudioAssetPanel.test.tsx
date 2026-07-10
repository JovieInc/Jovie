import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseAudioAssetPanel } from '@/components/features/release/ReleaseAudioAssetPanel';

const blobUploadMock = vi.fn();
const decodeWaveformPeaksMock = vi.fn();

vi.mock('@vercel/blob/client', () => ({
  upload: (...args: unknown[]) => blobUploadMock(...args),
}));

vi.mock('@/lib/audio/decode-waveform-peaks', () => ({
  decodeWaveformPeaks: (...args: unknown[]) => decodeWaveformPeaksMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ReleaseAudioAssetPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decodeWaveformPeaksMock.mockResolvedValue({
      peaks: [0.2, 0.8, 0.5],
      durationMs: 120_000,
    });
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
});
