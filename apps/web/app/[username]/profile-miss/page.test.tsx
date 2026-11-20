import { describe, expect, it, vi } from 'vitest';

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  })
);
const connectionMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('next/server', () => ({
  connection: connectionMock,
}));

import ProfileMissPage, { generateMetadata } from './page';

describe('profile miss destination', () => {
  it('renders dynamically and throws NEXT_NOT_FOUND so the branded boundary renders', async () => {
    // The gate rewrites unknown handles here. The boundary must come from
    // this route's DYNAMIC render — a static-eligible route's on-demand
    // (ISR-fallback) notFound() serves Next's flight-only __next_error__
    // shell instead (no SSR body, no noindex meta), which is exactly what
    // the nightly profile-visual-audit lane served before JOV-13104. The
    // connection() marker pins the render dynamic (the sibling
    // notifications route's pattern; a legacy route-segment export would
    // grow the stack-pattern ratchet past its cap).
    await expect(ProfileMissPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it('returns title-only metadata and lets the automatic NonIndex noindex fire once', async () => {
    const metadata = await generateMetadata();
    expect(metadata).toEqual({ title: 'Not Found' });
  });
});
