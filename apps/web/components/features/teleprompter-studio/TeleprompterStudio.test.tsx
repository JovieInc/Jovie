import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeleprompterRecordingContext } from '@/lib/teleprompter/types';

const mocks = vi.hoisted(() => ({
  openStudioCamera: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/hooks/useJovieAuth', () => ({
  useAuthSafe: () => ({ userId: 'user_1' }),
}));

vi.mock('@/lib/teleprompter/analytics', () => ({
  trackTeleprompterFunnel: mocks.track,
}));

vi.mock('@/lib/chat/transcriber', () => ({
  isWebSpeechTranscriptionSupported: () => false,
  createWebSpeechTranscriber: vi.fn(),
}));

vi.mock('@/lib/teleprompter/studio-recorder', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/lib/teleprompter/studio-recorder')
  >()),
  canUseStudioCamera: () => true,
  openStudioCamera: mocks.openStudioCamera,
}));

import { TeleprompterStudio } from './TeleprompterStudio';

const context: TeleprompterRecordingContext = {
  profileId: 'profile_1',
  kind: 'promo',
  title: 'Release day shout-out',
  script: 'Tonight I play it live.',
  showcaseVariant: 'direct',
  source: 'chat_proposal',
};

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
});

beforeEach(() => {
  mocks.openStudioCamera.mockReset();
  mocks.track.mockReset();
});

describe('TeleprompterStudio', () => {
  it('opens on the script once the camera is live', async () => {
    mocks.openStudioCamera.mockResolvedValue({ getTracks: () => [] });
    const onClose = vi.fn();
    render(<TeleprompterStudio context={context} onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByLabelText('Start recording')).not.toBeDisabled()
    );
    expect(screen.getByTestId('teleprompter-studio-script')).toHaveTextContent(
      'Tonight'
    );
    expect(mocks.track).toHaveBeenCalledWith(
      'teleprompter_studio_opened',
      expect.objectContaining({ followMode: 'speed' })
    );

    fireEvent.click(screen.getByTestId('teleprompter-studio-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('releases a camera that opens after the studio closed', async () => {
    let resolveCamera: (stream: unknown) => void = () => undefined;
    mocks.openStudioCamera.mockReturnValue(
      new Promise(resolve => {
        resolveCamera = resolve;
      })
    );
    const stop = vi.fn();
    const { unmount } = render(
      <TeleprompterStudio context={context} onClose={vi.fn()} />
    );

    unmount();
    resolveCamera({ getTracks: () => [{ stop }, { stop }] });

    await waitFor(() => expect(stop).toHaveBeenCalledTimes(2));
  });

  it('explains a blocked camera', async () => {
    mocks.openStudioCamera.mockRejectedValue(
      new DOMException('denied', 'NotAllowedError')
    );
    render(<TeleprompterStudio context={context} onClose={vi.fn()} />);

    expect(
      await screen.findByText('Jovie needs your camera and mic')
    ).toBeInTheDocument();
    expect(mocks.track).toHaveBeenCalledWith(
      'teleprompter_studio_camera_blocked',
      expect.objectContaining({ reason: 'denied' })
    );
  });
});
