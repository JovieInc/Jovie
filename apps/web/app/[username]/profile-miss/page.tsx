import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

// JOV-13104: pin the route dynamic. The page reads no request data, so
// Next otherwise classifies it static-eligible and serves its on-demand
// render through the ISR-fallback path — the exact path whose notFound()
// serves the flight-only `__next_error__` shell this route exists to avoid
// (observed on production and the nightly Visual Regression
// profile-visual-audit suite since 2026-11-13). force-dynamic makes the
// request render a real dynamic render, so notFound() renders the branded
// app/[username]/not-found.tsx boundary in the first HTML.
export const dynamic = 'force-dynamic';

/**
 * Publication-gate miss destination (JOV-10267 branded profile 404).
 *
 * The edge publication gate rewrites unknown/withdrawn handles here. This
 * route is pinned `force-dynamic` above: notFound() thrown during a
 * static-eligible route's on-demand (ISR-fallback) render serves Next's
 * flight-only `__next_error__` shell — no server-rendered branded page, no
 * noindex robots meta (observed on production 4fd78e95b, the daily ci.yml
 * dispatch run 43271726565 on 2026-11-12, and the nightly Visual Regression
 * profile-visual-audit lane on 2026-11-13). On a dynamic route the
 * app/[username]/not-found.tsx boundary renders server-side with a real 404
 * status and Next's automatic NonIndex noindex meta.
 *
 * The page is reachable only by visiting it directly (or via the gate
 * rewrite); it renders the branded 404 for any handle, which is the correct
 * response for a path that does not exist.
 */
export function generateMetadata(): Metadata {
  // Title only — Next's automatic NonIndex emits the single noindex robots
  // meta for the 404 status; an explicit robots meta here emitted TWO robots
  // tags and failed the synthetic smoke's noindex-count-1 assertion
  // (JOV-12153).
  return { title: 'Not Found' };
}

export default function ProfileMissPage() {
  notFound();
}
