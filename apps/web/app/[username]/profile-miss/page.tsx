import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

/**
 * Publication-gate miss destination (JOV-10267 branded profile 404).
 *
 * The edge publication gate rewrites unknown/withdrawn handles here. The
 * render must be dynamic: notFound() thrown during a static-eligible route's
 * on-demand (ISR-fallback) render serves Next's flight-only `__next_error__`
 * shell — no server-rendered branded page, no noindex robots meta (observed
 * on production 4fd78e95b, the daily ci.yml dispatch run 43271726565 on
 * 2026-11-12, and the nightly Visual Regression profile-visual-audit lane on
 * 2026-11-13). On a dynamic route the app/[username]/not-found.tsx boundary
 * renders server-side with a real 404 status and Next's automatic NonIndex
 * noindex meta.
 *
 * JOV-13104: the route reads no other request data, so it is pinned dynamic
 * with the `await connection()` marker — the same pattern the sibling
 * notifications route uses — instead of a legacy route-segment cache export;
 * the stack-pattern ratchet caps those legacy exports at their current count.
 */
export function generateMetadata(): Metadata {
  // Title only — Next's automatic NonIndex emits the single noindex robots
  // meta for the 404 status; an explicit robots meta here emitted TWO robots
  // tags and failed the synthetic smoke's noindex-count-1 assertion
  // (JOV-12153).
  return { title: 'Not Found' };
}

export default async function ProfileMissPage() {
  // Reading the request connection opts this render into dynamic rendering,
  // so the notFound() below renders the branded boundary in the first HTML.
  await connection();
  notFound();
}
