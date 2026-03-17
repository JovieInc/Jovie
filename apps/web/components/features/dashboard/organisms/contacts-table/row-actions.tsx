'use client';

import type { ContextMenuItemType } from '@/components/organisms/table';
import type { EditableContact } from '@/features/dashboard/hooks/useContactsManager';

export type { BuildContactActionsCallbacks as ContactRowActionCallbacks } from './contact-actions';

import {
  type BuildContactActionsCallbacks,
  buildContactActions,
} from './contact-actions';

/**
 * @deprecated Use `buildContactActions` directly from `./contact-actions`.
 * This wrapper is kept for backward compatibility.
 */
export function getContactRowContextMenuItems(
  contact: EditableContact,
  callbacks: BuildContactActionsCallbacks
): ContextMenuItemType[] {
  return buildContactActions(contact, callbacks);
}
