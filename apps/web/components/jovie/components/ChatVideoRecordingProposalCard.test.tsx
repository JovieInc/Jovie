import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { startTeleprompterRecording } from '@/lib/teleprompter/recorder';
import type { VideoRecordingProposalPayload } from '@/lib/teleprompter/types';
import { uploadRecordableVideo } from '@/lib/teleprompter/upload-video';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

  it('passes the interview questions to Record In App', () => {
    fastRender(
      <ChatVideoRecordingProposalCard
        profileId='profile_story'
        payload={{ ...payload, questions: ['Where did you write it?'] }}
      />
    );

    fireEvent.click(screen.getByTestId('chat-video-recording-record-in-app'));
    expect(startTeleprompterRecording).toHaveBeenCalledWith(
      expect.objectContaining({ questions: ['Where did you write it?'] })
    );
  });

  it('shows why an upload failed and lets the artist try again', async () => {
    vi.mocked(uploadRecordableVideo).mockRejectedValue(
      new Error('Video is larger than 500 MB.')
    );
    const { container } = renderCard();

    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['video'], 'promo.mp4', { type: 'video/mp4' })],
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Video is larger than 500 MB.'
    );
    expect(
      screen.getByTestId('chat-video-recording-upload')
    ).not.toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('keeps the file input out of the tab order and limited to video', () => {
    const { container } = renderCard();

    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(fileInput).toHaveClass('hidden');
    expect(fileInput.tabIndex).toBe(-1);
    expect(fileInput.accept).toBe('video/mp4,video/quicktime');
  });

  it('has no accessibility violations in the proposal and uploaded states', async () => {
    vi.mocked(uploadRecordableVideo).mockResolvedValue({
      blobUrl: 'blob:video',
    });
    const { container } = renderCard();
    await expectNoA11yViolations(container);

    fireEvent.change(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      {
        target: {
          files: [new File(['video'], 'promo.mp4', { type: 'video/mp4' })],
        },
      }
    );
    await screen.findByTestId('chat-video-recording-upload-success');
    await expectNoA11yViolations(container);
  });
});
