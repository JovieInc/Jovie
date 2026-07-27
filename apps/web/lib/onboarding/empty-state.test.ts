import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_ENTRY_SUPPORT,
  ONBOARDING_ENTRY_TITLE,
  ONBOARDING_STARTER_SUGGESTIONS,
} from './empty-state';

describe('onboarding empty state copy', () => {
  it('keeps the blank entry concise and artist-specific', () => {
    expect(ONBOARDING_ENTRY_TITLE).toBe('What Are You Working On?');
    expect(ONBOARDING_ENTRY_SUPPORT).toMatch(
      /artist name, Spotify link, or next release/i
    );
    expect(`${ONBOARDING_ENTRY_TITLE} ${ONBOARDING_ENTRY_SUPPORT}`).not.toMatch(
      /early access|waitlist|remember/i
    );
  });

  it('exposes four starter suggestions with prompts', () => {
    expect(ONBOARDING_STARTER_SUGGESTIONS).toHaveLength(4);
    for (const suggestion of ONBOARDING_STARTER_SUGGESTIONS) {
      expect(suggestion.label.length).toBeGreaterThan(0);
      expect(suggestion.prompt.length).toBeGreaterThan(0);
    }
  });
});
