import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VideoRecordingProposalPayload } from '@/lib/teleprompter/types';
import { uploadRecordableVideo } from '@/lib/teleprompter/upload-video';
import { fastRender } from '@/tests/utils/fast-render';
import { ChatVideoRecordingProposalCard } from './ChatVideoRecordingProposalCard';

vi.mock('@/lib/teleprompter/analytics', () => ({
  trackTeleprompterFunnel: vi.fn(),
}));

vi.mock('@/lib/teleprompter/recorder', () => ({
  startTeleprompterRecording: vi.fn(),
}));

vi.mock('@/lib/teleprompter/upload-video', () => ({
  getTeleprompterVideoAcceptTypes: () => 'video/mp4,video/quicktime',
  uploadRecordableVideo: vi.fn(),
}));

const payload: VideoRecordingProposalPayload = {
  success: true,
  kind: 'promo',
  title: 'Record a 30-second promo',
  script: 'Hold the camera at eye level, then walk through the release.',
  showcaseVariant: 'direct',
};

function renderCard() {
  return fastRender(
    <ChatVideoRecordingProposalCard
      profileId='profile_story'
      payload={payload}
    />
  );
}

describe('ChatVideoRecordingProposalCard', () => {
  it('renders the proposal title, script, and both actions', () => {
    renderCard();

    expect(screen.getByText('Record a 30-second promo')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Hold the camera at eye level, then walk through the release.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('chat-video-recording-proposal-card')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('chat-video-recording-upload')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('chat-video-recording-record-in-app')
    ).toBeInTheDocument();
  });

  it('keeps the upload button clickable before an upload starts', () => {
    renderCard();

    const uploadButton = screen.getByTestId('chat-video-recording-upload');
    expect(uploadButton).not.toBeDisabled();
    fireEvent.click(uploadButton);
    expect(uploadButton).not.toBeDisabled();
  });

  it('confirms a finished upload lands in Work', async () => {
    vi.mocked(uploadRecordableVideo).mockResolvedValue({
      blobUrl: 'blob:video',
    });
    const { container } = renderCard();

    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['video'], 'promo.mp4', { type: 'video/mp4' })],
      },
    });

    await waitFor(() =>
      expect(
        screen.getByTestId('chat-video-recording-upload-success')
      ).toBeInTheDocument()
    );
    expect(screen.getByText('Video uploaded to Work')).toBeInTheDocument();
  });
});
