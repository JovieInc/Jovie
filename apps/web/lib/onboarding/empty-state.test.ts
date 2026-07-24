import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STARTER_SUGGESTIONS,
  ONBOARDING_WELCOME_MESSAGE,
} from './empty-state';

describe('onboarding empty state copy', () => {
  it('includes memory disclosure, early-access disclosure, and one intake question', () => {
    expect(ONBOARDING_WELCOME_MESSAGE).toMatch(/remember/i);
    expect(ONBOARDING_WELCOME_MESSAGE).toMatch(/early access|waitlist/i);
    expect(ONBOARDING_WELCOME_MESSAGE).toMatch(/what are you working on/i);
    expect((ONBOARDING_WELCOME_MESSAGE.match(/\?/g) ?? []).length).toBe(1);
  });

  it('exposes four starter suggestions with prompts', () => {
    expect(ONBOARDING_STARTER_SUGGESTIONS).toHaveLength(4);
    for (const suggestion of ONBOARDING_STARTER_SUGGESTIONS) {
      expect(suggestion.label.length).toBeGreaterThan(0);
      expect(suggestion.prompt.length).toBeGreaterThan(0);
    }
  });
});
