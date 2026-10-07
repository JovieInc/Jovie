import { describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ permanentRedirect: redirect }));

import JovieWorkPage from './page';

describe('legacy work history destination', () => {
  it('permanently directs the old standalone feed to Done for you inside Inbox', () => {
    JovieWorkPage();
    expect(redirect).toHaveBeenCalledWith('/app?view=done');
  });
});
