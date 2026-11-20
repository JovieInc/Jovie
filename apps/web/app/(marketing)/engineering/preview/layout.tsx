import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Founder-only preview gallery gate (JOV-5475).
 *
 * The route manifest keeps /engineering/preview "must remain unpublished":
 * the proxy already blocks it on every hosted deployment, and this layout
 * keeps it a 404 on CI preview servers too. The gallery renders only on a
 * real local development server (NODE_ENV=development, i.e. `next dev` /
 * `vercel dev`). The E2E full matrix serves a production standalone build
 * with NODE_ENV=test and VERCEL_ENV=development; VERCEL_ENV alone must not
 * publish founder drafts, so this gate keys on the server's own dev mode.
 */
export default function EngineeringPreviewLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return children;
}
