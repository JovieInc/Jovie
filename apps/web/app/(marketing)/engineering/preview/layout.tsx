import type { ReactNode } from 'react';
import { requireDevelopmentOnlyPage } from '@/lib/security/require-development-only';

/**
 * Draft engineering stories are a local founder gallery, never a public page.
 * The proxy also blocks /engineering/preview outside development.
 */
export default function EngineeringPreviewLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  requireDevelopmentOnlyPage();
  return children;
}
