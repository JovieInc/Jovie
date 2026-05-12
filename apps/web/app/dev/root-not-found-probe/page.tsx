import { notFound } from 'next/navigation';

// Diagnostic probe used by the public-exhaustive Playwright lane to verify
// that the root `app/not-found.tsx` renders correctly. Existing E2E 404
// surfaces (`/missing-qa-user`, smart-link slugs) all hit closer not-found
// boundaries inside `app/[username]/`, so the root page was never exercised
// — which is why the unstyled-megamenu regression (JOV-2145) shipped.
//
// Calling notFound() here walks up to the closest not-found.tsx, and the
// closest one above `app/dev/root-not-found-probe/` is the root one.
// A real user hitting this URL just sees the standard 404 page — no info
// leak, so no env guard is needed.
export default function RootNotFoundProbe(): never {
  notFound();
}
