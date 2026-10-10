import { describe, expect, it, vi } from 'vitest';

vi.unmock('next/navigation');

import JovieWorkPage from './page';

describe('legacy work history destination', () => {
  it('returns the real permanent redirect to Done for you inside Inbox', () => {
    let redirectError: unknown;
    try {
      JovieWorkPage();
    } catch (error) {
      redirectError = error;
    }
    expect(redirectError).toHaveProperty(
      'digest',
      'NEXT_REDIRECT;replace;/app?view=done;308;'
    );
  });
});
