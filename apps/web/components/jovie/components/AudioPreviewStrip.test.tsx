import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { PendingAudio } from '../hooks/useChatAudioAttachments';
import { AudioPreviewStrip } from './AudioPreviewStrip';

const audio: PendingAudio = {
  id: 'a1',
  name: 'sober.wav',
  mediaType: 'audio/wav',
  status: 'ready',
};

describe('AudioPreviewStrip', () => {
  it('labels a ready file as a new track and omits remove without a handler', async () => {
    const { container } = render(<AudioPreviewStrip audio={audio} />);

    expect(screen.getByText('New track · sober.wav')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('removes the file when the remove button is pressed', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { container } = render(
      <AudioPreviewStrip audio={audio} onRemove={onRemove} />
    );

    await user.click(screen.getByRole('button', { name: 'Remove sober.wav' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it.each([
    ['uploading', undefined, 'Uploading audio…'],
    ['processing', undefined, 'Processing audio…'],
    ['failed', 'Too large', 'Too large'],
    ['cancelled', undefined, 'Upload cancelled'],
  ] as const)('shows the %s state copy', async (status, error, copy) => {
    const { container } = render(
      <AudioPreviewStrip audio={{ ...audio, status, error }} />
    );

    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByTestId('chat-audio-preview-strip')).toHaveAttribute(
      'data-upload-state',
      status
    );
    await expectNoA11yViolations(container);
  });

  it('shows the preview player for a ready file with a preview url', async () => {
    const { container } = render(
      <AudioPreviewStrip
        audio={{ ...audio, previewUrl: 'blob:x', releaseTitle: 'Sober' }}
      />
    );

    expect(screen.getByTestId('chat-audio-preview-player')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
