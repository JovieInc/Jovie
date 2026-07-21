import { describe, expect, it } from 'vitest';
import {
  ATTACH_ACCOUNT_CTA_LABEL,
  CONFIRM_HANDLE_CTA_LABEL,
  isIncompleteAdvanceMessage,
  isMeaningfulIntakeAnswer,
  isOnboardingWidgetEventType,
  NONE_OF_THESE_CTA_LABEL,
  ONBOARDING_GUARDED_STEPS,
  ONBOARDING_WIDGET_EVENTS,
  parseWidgetEventFromMetadata,
  widgetEventDisplayText,
} from '@/lib/chat/onboarding-script/widget-events';

describe('onboarding widget events', () => {
  it('exposes the guarded step rail in order', () => {
    expect(ONBOARDING_GUARDED_STEPS).toEqual([
      'role',
      'artist_search',
      'artist_select',
      'handle',
      'social',
      'contact',
      'waitlist_or_complete',
    ]);
  });

  it('uses Title Case CTAs', () => {
    expect(CONFIRM_HANDLE_CTA_LABEL).toBe('Confirm Handle');
    expect(ATTACH_ACCOUNT_CTA_LABEL).toBe('Attach Account');
    expect(NONE_OF_THESE_CTA_LABEL).toBe('None of These');
  });

  it('parses handle_confirmed metadata', () => {
    expect(
      parseWidgetEventFromMetadata({
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.HANDLE_CONFIRMED,
        handle: '@TestArtist',
      })
    ).toEqual({
      onboardingEvent: 'handle_confirmed',
      handle: 'testartist',
    });
  });

  it('parses social_attached metadata', () => {
    expect(
      parseWidgetEventFromMetadata({
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.SOCIAL_ATTACHED,
        url: 'https://instagram.com/x',
      })
    ).toEqual({
      onboardingEvent: 'social_attached',
      url: 'https://instagram.com/x',
    });
  });

  it('rejects unknown events', () => {
    expect(isOnboardingWidgetEventType('nope')).toBe(false);
    expect(
      parseWidgetEventFromMetadata({ onboardingEvent: 'nope' })
    ).toBeNull();
  });

  it('treats incomplete acks as non-advancing', () => {
    expect(isIncompleteAdvanceMessage('')).toBe(true);
    expect(isIncompleteAdvanceMessage('k')).toBe(true);
    expect(isIncompleteAdvanceMessage('ok')).toBe(true);
    expect(isIncompleteAdvanceMessage('  OK  ')).toBe(true);
    expect(isIncompleteAdvanceMessage('like 300 people')).toBe(false);
    expect(isIncompleteAdvanceMessage('planning a single')).toBe(false);
  });

  it('requires meaningful intake answers', () => {
    expect(isMeaningfulIntakeAnswer('k')).toBe(false);
    expect(isMeaningfulIntakeAnswer('ok')).toBe(false);
    expect(isMeaningfulIntakeAnswer('a')).toBe(false);
    expect(isMeaningfulIntakeAnswer('artist')).toBe(true);
  });

  it('builds display text for widget events', () => {
    expect(
      widgetEventDisplayText({
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.HANDLE_CONFIRMED,
        handle: 'tim',
      })
    ).toBe('Confirmed handle @tim');
    expect(
      widgetEventDisplayText({
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.SOCIAL_ATTACHED,
        url: 'https://x.com/t',
      })
    ).toBe('Attached https://x.com/t');
    expect(
      widgetEventDisplayText({
        onboardingEvent: ONBOARDING_WIDGET_EVENTS.ARTIST_NONE_OF_THESE,
      })
    ).toBe('None of these artists match');
  });
});
