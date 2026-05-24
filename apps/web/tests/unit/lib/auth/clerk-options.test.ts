import { describe, expect, it } from 'vitest';
import { CLERK_COMPONENT_OPTIONS } from '@/lib/auth/clerk-options';

describe('CLERK_COMPONENT_OPTIONS', () => {
  it('includes oidcPrompt: select_account to force the provider account chooser', () => {
    expect(CLERK_COMPONENT_OPTIONS.oidcPrompt).toBe('select_account');
  });

  it('is a plain object (safe to spread into Clerk SignIn / SignUp props)', () => {
    expect(typeof CLERK_COMPONENT_OPTIONS).toBe('object');
    expect(Array.isArray(CLERK_COMPONENT_OPTIONS)).toBe(false);
  });
});
