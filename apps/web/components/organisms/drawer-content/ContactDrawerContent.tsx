'use client';

import type { ReactNode } from 'react';

export interface ContactDrawerContentProps {
  readonly contactId: string;
  readonly type: 'creator' | 'audience';
  readonly children?: ReactNode;
}

/**
 * ContactDrawerContent - Unified contact drawer for creators/audience
 *
 * TODO: This is a placeholder for Phase 2.
 * Will need to extract and unify content from:
 * - ContactSidebar (admin creators)
 * - AudienceMemberSidebar (dashboard audience)
 *
 * For now, this component will render its children to allow
 * the existing contact sidebars to continue working.
 */
export function ContactDrawerContent({
  contactId,
  type,
  children,
}: ContactDrawerContentProps) {
  // Placeholder implementation - render children for now
  // This allows existing contact sidebar implementations to work
  // while we build out the unified structure
  return <>{children}</>;
}
