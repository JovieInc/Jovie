import { describe, expect, it } from 'vitest';
import {
  hasClerkOriginMismatchSignal,
  isClerkHandshakeUrl,
  isClerkOriginMismatchMessage,
} from './clerk-auth';

describe('clerk-auth helpers', () => {
  it('detects clerk handshake urls', () => {
    expect(
      isClerkHandshakeUrl(
        'https://clerk.example.com/v1/client/handshake?redirect_url=%2Fapp'
      )
    ).toBe(true);
    expect(
      isClerkHandshakeUrl(
        'https://clerk.example.com/v1/client/dev-browser?redirect_url=%2Fapp'
      )
    ).toBe(true);
    expect(isClerkHandshakeUrl('https://jov.ie/signin')).toBe(false);
  });

  it('detects clerk preview origin mismatch messages', () => {
    expect(
      isClerkOriginMismatchMessage(
        'Clerk: Production Keys are only allowed for domain "staging.jov.ie".'
      )
    ).toBe(true);
    expect(
      isClerkOriginMismatchMessage(
        'API Error: The Request HTTP Origin header must be equal to or a subdomain of the requesting URL.'
      )
    ).toBe(true);
    expect(
      isClerkOriginMismatchMessage('TimeoutError: page.waitForFunction')
    ).toBe(false);
  });

  it('detects clerk origin mismatch from timeout plus console warning', () => {
    expect(
      hasClerkOriginMismatchSignal('TimeoutError: page.waitForFunction', [
        'Clerk: Production Keys are only allowed for domain "staging.jov.ie".',
      ])
    ).toBe(true);
    expect(
      hasClerkOriginMismatchSignal('TimeoutError: page.waitForFunction', [
        'Some unrelated warning',
      ])
    ).toBe(false);
  });
});
