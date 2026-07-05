import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatVideoRecordingProposalCard } from '@/components/jovie/components/ChatVideoRecordingProposalCard';
import {
  hasCompletedTeleprompterRecording,
  markTeleprompterRecordingCompleted,
  shouldShowTeleprompterShowcase,
} from '@/lib/teleprompter/persistence';
import {
  startTeleprompterRecording,
  TELEPROMPTER_START_EVENT,
} from '@/lib/teleprompter/recorder';
import { isVideoRecordingProposalPayload } from '@/lib/teleprompter/types';

const trackMock = vi.fn();

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock('@vercel/blob/client', () => ({
  upload: vi.fn(),
}));

const payload = {
  success: true as const,
  kind: 'promo' as const,
  title: 'Release day shout-out',
  script: 'Hey everyone, my new single is out now on every platform.',
  showcaseVariant: 'interstitial' as const,
};

describe('teleprompter showcase funnel', () => {
  beforeEach(() => {
    trackMock.mockReset();
    localStorage.clear();
  });

  it('validates proposal payloads', () => {
    expect(isVideoRecordingProposalPayload(payload)).toBe(true);
    expect(isVideoRecordingProposalPayload({ success: false })).toBe(false);
  });

  it('skips the showcase after the first successful recording', () => {
    expect(shouldShowTeleprompterShowcase('profile-1', 'interstitial')).toBe(
      true
    );
    markTeleprompterRecordingCompleted('profile-1');
    expect(hasCompletedTeleprompterRecording('profile-1')).toBe(true);
    expect(shouldShowTeleprompterShowcase('profile-1', 'interstitial')).toBe(
      false
    );
  });

  it('opens the bento interstitial before starting the recorder', async () => {
    const user = userEvent.setup();
    render(
      <ChatVideoRecordingProposalCard profileId='profile-1' payload={payload} />
    );

    expect(
      screen.getByTestId('chat-video-recording-proposal-card')
    ).toBeInTheDocument();
    expect(screen.getByTestId('chat-video-recording-upload')).toHaveTextContent(
      'Upload Video'
    );
    expect(
      screen.getByTestId('chat-video-recording-record-in-app')
    ).toHaveTextContent('Record In App');

    await user.click(screen.getByTestId('chat-video-recording-record-in-app'));

    expect(
      screen.getByTestId('teleprompter-showcase-interstitial')
    ).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith(
      'teleprompter_proposal_impression',
      expect.objectContaining({ profileId: 'profile-1', kind: 'promo' })
    );
    expect(trackMock).toHaveBeenCalledWith(
      'teleprompter_showcase_impression',
      expect.objectContaining({ showcaseVariant: 'interstitial' })
    );
  });

  it('starts recording from the showcase CTA', async () => {
    const user = userEvent.setup();
    const startListener = vi.fn();
    window.addEventListener(TELEPROMPTER_START_EVENT, startListener);

    render(
      <ChatVideoRecordingProposalCard profileId='profile-4' payload={payload} />
    );

    await user.click(screen.getByTestId('chat-video-recording-record-in-app'));
    await user.click(screen.getByTestId('teleprompter-showcase-start'));

    await waitFor(() => {
      expect(startListener).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByTestId('teleprompter-showcase-interstitial')
    ).not.toBeInTheDocument();

    window.removeEventListener(TELEPROMPTER_START_EVENT, startListener);
  });

  it('starts recording directly for the control variant', async () => {
    const user = userEvent.setup();
    const startListener = vi.fn();
    window.addEventListener(TELEPROMPTER_START_EVENT, startListener);

    render(
      <ChatVideoRecordingProposalCard
        profileId='profile-2'
        payload={{ ...payload, showcaseVariant: 'direct' }}
      />
    );

    await user.click(screen.getByTestId('chat-video-recording-record-in-app'));

    await waitFor(() => {
      expect(startListener).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByTestId('teleprompter-showcase-interstitial')
    ).not.toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith(
      'teleprompter_recording_started',
      expect.objectContaining({ showcaseVariant: 'direct' })
    );

    window.removeEventListener(TELEPROMPTER_START_EVENT, startListener);
  });

  it('dispatches a recorder start event from the helper', () => {
    const listener = vi.fn();
    window.addEventListener(TELEPROMPTER_START_EVENT, listener);

    startTeleprompterRecording({
      profileId: 'profile-3',
      kind: 'thank_you',
      title: 'Fan thank-you',
      script: 'Thank you for streaming my music this week.',
      showcaseVariant: 'direct',
      source: 'chat_proposal',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(TELEPROMPTER_START_EVENT, listener);
  });
});
