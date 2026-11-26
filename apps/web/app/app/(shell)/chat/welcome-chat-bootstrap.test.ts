import { describe, expect, it } from 'vitest';
import {
  getWelcomeChatBootstrapAnnouncement,
  resetWelcomeChatBootstrapState,
  shouldRetryWelcomeChatBootstrap,
} from './welcome-chat-bootstrap';

describe('welcome-chat-bootstrap helpers', () => {
  it('treats onboarding profile-missing 404s as retryable', () => {
    expect(shouldRetryWelcomeChatBootstrap(404)).toBe(true);
  });

  it('resets scheduled bootstrap state during cleanup', () => {
    const stateRef = { current: 'scheduled' as const };
    const retryCountRef = { current: 2 };

    resetWelcomeChatBootstrapState(stateRef, retryCountRef);

    expect(stateRef.current).toBe('idle');
    expect(retryCountRef.current).toBe(0);
  });

  it('announces pending bootstrap for screen readers', () => {
    expect(getWelcomeChatBootstrapAnnouncement('pending')).toBe(
      'Starting your onboarding chat.'
    );
  });
});
