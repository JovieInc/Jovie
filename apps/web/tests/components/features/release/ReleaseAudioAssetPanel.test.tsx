import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))
    );
    decodeWaveformPeaksMock.mockResolvedValue({
      peaks: [0.2, 0.8, 0.5],
      durationMs: 120_000,
    });
  });

  it('renders an upload dropzone when audio is missing', async () => {
    render(
      <ReleaseAudioAssetPanel
        releaseId='release-1'
        releaseTitle='Take Me Over'
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('release-audio-dropzone')).toBeInTheDocument();
    });
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

  it('shows one non-playable preparation state for an AIFF master', async () => {
    blobUploadMock.mockResolvedValue({
      url: 'https://cdn.example.com/master.aiff',
      pathname: 'library/audio/master.aiff',
    });
    const fetchMock = vi
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                previewUrl: null,
                hasAudioMaster: true,
                playbackDerivative: {
                  status: 'pending',
                  generation: 1,
                  sourceFormatId: 'aiff',
                  requestedAt: '2026-07-26T00:00:00.000Z',
                },
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      });
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
          new File(['audio'], 'take-me-over.aiff', { type: 'audio/aiff' }),
        ],
      },
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('release-audio-derivative-status')
      ).toHaveTextContent('Preparing preview');
    });
    expect(
      screen.queryByRole('button', { name: /play/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('audio-waveform-editor')
    ).not.toBeInTheDocument();
  });

  it('announces the initial audio-state check as busy without exposing controls', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );

    render(
      <ReleaseAudioAssetPanel
        releaseId='release-1'
        releaseTitle='Take Me Over'
      />
    );

    const status = screen.getByTestId('release-audio-derivative-status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Preparing preview');
    expect(status).toHaveTextContent(
      'Preparing a browser-ready preview and waveform.'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    [
      'pending',
      false,
      'Preparing preview',
      'Preparing a browser-ready preview and waveform.',
    ],
    [
      'retrying',
      false,
      'Preparing preview',
      'Preview preparation is retrying automatically.',
    ],
    [
      'failed',
      true,
      'Preview unavailable',
      'We could not prepare this preview. Your original is preserved.',
    ],
    [
      'unavailable',
      true,
      'Preview unavailable',
      'This format is preserved, but a browser preview is not available.',
    ],
    [
      'superseded',
      true,
      'Preview unavailable',
      'A newer audio upload replaced this preview.',
    ],
    [
      'ready',
      true,
      'Preview unavailable',
      'Preview metadata is ready, but its audio URL is unavailable.',
    ],
  ] as const)('keeps the %s derivative state non-playable with one recovery control', async (status, hasRecoveryControl, heading, copy) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            previewUrl: null,
            hasAudioMaster: true,
            playbackDerivative: {
              status,
              generation: 1,
              sourceFormatId: 'aiff',
              requestedAt: '2026-07-26T00:00:00.000Z',
              retryAt: '2026-07-26T00:01:00.000Z',
              failedAt: '2026-07-26T00:00:01.000Z',
              supersededAt: '2026-07-26T00:00:01.000Z',
              attempt: 1,
              maxAttempts: 3,
              reason:
                status === 'unavailable'
                  ? 'conversion_not_supported'
                  : 'conversion_failed',
            },
          }),
          { status: 200 }
        )
      )
    );

    render(
      <ReleaseAudioAssetPanel
        releaseId='release-1'
        releaseTitle='Take Me Over'
      />
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('release-audio-derivative-status')
      ).toBeInTheDocument();
    });
    const statusRegion = screen.getByTestId('release-audio-derivative-status');
    expect(statusRegion).toHaveTextContent(heading);
    expect(statusRegion).toHaveTextContent(copy);
    if (status === 'pending' || status === 'retrying') {
      expect(statusRegion).toHaveAttribute('aria-busy', 'true');
    } else {
      expect(statusRegion).not.toHaveAttribute('aria-busy');
    }
    expect(
      screen.queryByRole('button', { name: /play/i })
    ).not.toBeInTheDocument();
    const recoveryControl = screen.queryByRole('button', {
      name: 'Replace audio',
    });
    if (hasRecoveryControl) {
      expect(recoveryControl).toBeInTheDocument();
    } else {
      expect(recoveryControl).not.toBeInTheDocument();
    }
  });

  it('moves from pending to ready without remounting or exposing the master', async () => {
    vi.useFakeTimers();
    const onUploaded = vi.fn();
    const pendingBody = {
      previewUrl: null,
      hasAudioMaster: true,
      playbackDerivative: {
        status: 'pending',
        generation: 1,
        sourceFormatId: 'aiff',
        requestedAt: '2026-07-26T00:00:00.000Z',
      },
    };
    const readyBody = {
      previewUrl: 'https://cdn.example.com/preview.wav',
      hasAudioMaster: true,
      playbackDerivative: {
        status: 'ready',
        generation: 1,
        sourceFormatId: 'aiff',
        url: 'https://cdn.example.com/preview.wav',
        mimeType: 'audio/wav',
        readyAt: '2026-07-26T00:00:01.000Z',
        outputBytes: 88_244,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(pendingBody), { status: 200 })
      )
      .mockResolvedValue(
        new Response(JSON.stringify(readyBody), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReleaseAudioAssetPanel
        releaseId='release-1'
        releaseTitle='Take Me Over'
        onUploaded={onUploaded}
      />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByTestId('release-audio-derivative-status')
    ).toHaveTextContent('Preparing preview');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(screen.getByTestId('audio-waveform-editor')).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledWith(
      'https://cdn.example.com/preview.wav'
    );
  });
});
