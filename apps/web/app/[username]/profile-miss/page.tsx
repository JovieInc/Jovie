import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * Publication-gate miss destination (JOV-10267 branded profile 404).
 *
 * The edge publication gate rewrites unknown/withdrawn handles here. This
 * route is deliberately DYNAMIC (no generateStaticParams, no revalidate):
 * notFound() thrown during a prerendered ISR route's fallback render serves
 * Next's flight-only `__next_error__` shell — no server-rendered branded
 * page, no noindex robots meta (observed on production 4fd78e95b and daily
 * ci.yml dispatch run 43271726565, 2026-11-12). On a dynamic route the
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
