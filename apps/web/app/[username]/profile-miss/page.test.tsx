import { describe, expect, it, vi } from 'vitest';

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  })
);

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

import ProfileMissPage, {
  generateMetadata,
  dynamic as missRouteDynamic,
} from './page';

describe('profile miss destination', () => {
  it('throws NEXT_NOT_FOUND so the branded [username] not-found boundary renders', () => {
    // The gate rewrites unknown handles here. The boundary must come from
    // this DYNAMIC route's notFound() — the prerendered mode-render route's
    // fallback notFound() serves Next's flight-only __next_error__ shell
    // instead (no SSR body, no noindex meta).
    expect(() => ProfileMissPage()).toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('pins the route dynamic so the branded boundary renders, never the flight-only shell', () => {
    // JOV-13104: without this export the page reads no request data, so Next
    // classifies it static-eligible and serves its on-demand render through
    // the ISR-fallback path — whose notFound() serves the flight-only
    // __next_error__ shell instead of the branded not-found boundary.
    expect(missRouteDynamic).toBe('force-dynamic');
  });

  it('returns title-only metadata and lets the automatic NonIndex noindex fire once', async () => {
    const metadata = await generateMetadata();
    expect(metadata).toEqual({ title: 'Not Found' });
  });
});
