import { describe, expect, it } from 'vitest';
import { isSameDocumentRedirect } from './same-document-redirect';

describe('isSameDocumentRedirect', () => {
  it('is true when pathname matches on the same origin', () => {
    expect(
      isSameDocumentRedirect('/start', 'https://staging.jov.ie/start')
    ).toBe(true);
    expect(
      isSameDocumentRedirect(
        'https://staging.jov.ie/start',
        'https://staging.jov.ie/start'
      )
    ).toBe(true);
  });

  it('ignores trailing slashes and query/hash on the current document', () => {
    expect(
      isSameDocumentRedirect('/start', 'https://staging.jov.ie/start/')
    ).toBe(true);
    expect(
      isSameDocumentRedirect(
        '/start',
        'https://staging.jov.ie/start?starter_prompt=hi#x'
      )
    ).toBe(true);
  });

  it('is false for a different path or origin', () => {
    expect(
      isSameDocumentRedirect('/start', 'https://staging.jov.ie/signin')
    ).toBe(false);
    expect(isSameDocumentRedirect('/app', 'https://staging.jov.ie/start')).toBe(
      false
    );
    expect(
      isSameDocumentRedirect(
        'https://other.example/start',
        'https://staging.jov.ie/start'
      )
    ).toBe(false);
  });

  it('is false when the current href is missing or unparseable', () => {
    expect(isSameDocumentRedirect('/start', undefined)).toBe(false);
    expect(isSameDocumentRedirect('/start', 'not a url')).toBe(false);
  });
});
