import { describe, expect, it } from 'vitest';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import {
  AGENT_CLAIM_ERROR_CODES,
  agentClaimStateCopy,
  authHref,
  parseAgentClaimErrorCode,
} from './claim-states';

describe('agent claim states', () => {
  it('gives every state at least one internal next action (no dead ends)', () => {
    for (const code of AGENT_CLAIM_ERROR_CODES) {
      const copy = agentClaimStateCopy(code);
      expect(copy.title).toBeTruthy();
      expect(copy.actions.length).toBeGreaterThan(0);
      for (const action of copy.actions) {
        expect(action.href.startsWith('/')).toBe(true);
        expect(action.href.startsWith('//')).toBe(false);
      }
    }
  });

  it('offers both restart paths for invalid and expired handoffs', () => {
    for (const code of ['invalid', 'expired'] as const) {
      const copy = agentClaimStateCopy(code);
      expect(copy.body).toMatch(/assistant/i);
      expect(copy.actions.map(action => action.href)).toContain('/start');
    }
  });

  it('sends waitlisted users to the waitlist', () => {
    expect(
      agentClaimStateCopy('waitlist_pending').actions.map(action => action.href)
    ).toEqual(['/waitlist']);
  });

  it('never claims the person verifies they are the artist', () => {
    for (const code of AGENT_CLAIM_ERROR_CODES) {
      expect(agentClaimStateCopy(code).body).not.toMatch(
        /verify (that )?(it is|you are)/i
      );
    }
  });

  it('accepts only known error codes from the query string', () => {
    expect(parseAgentClaimErrorCode('artist_taken')).toBe('artist_taken');
    expect(parseAgentClaimErrorCode('https://evil.example')).toBeNull();
    expect(parseAgentClaimErrorCode(['invalid'])).toBeNull();
    expect(parseAgentClaimErrorCode(undefined)).toBeNull();
  });

  it('builds auth links that return to the claim page and pass the redirect sanitizer', () => {
    const returnPath =
      '/claim/agent/9efebd98-39b7-4a77-8965-04b5aafad9ad?h=abc';
    const href = authHref('/signup', returnPath);
    const redirect = new URL(href, 'https://jov.ie').searchParams.get(
      'redirect_url'
    );
    expect(redirect).toBe(returnPath);
    expect(sanitizeRedirectUrl(redirect)).toBe(returnPath);
  });
});
