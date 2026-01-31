/**
 * ContactSidebar Types
 *
 * Type definitions for the ContactSidebar component.
 */

import type { Contact as BaseContact, ContactSidebarMode } from '@/types';

export type Contact = BaseContact;

export interface SocialLink {
  id?: string;
  url: string;
  label?: string;
  platformType?: string;
}

export interface ContactSidebarProps {
  readonly contact: Contact | null;
  readonly mode: ContactSidebarMode;
  readonly isOpen: boolean;
  readonly onClose?: () => void;
  readonly onRefresh?: () => void;
  readonly onContactChange?: (contact: Contact) => void;
  readonly onSave?: (
    contact: Contact
  ) => void | Promise<void> | Promise<boolean>;
  readonly isSaving?: boolean;
  /**
   * Optional avatar upload handler. When provided and mode === 'admin',
   * the avatar becomes uploadable and this callback is used to obtain
   * the new avatar URL. The updated URL will be merged into the contact
   * and emitted via onContactChange.
   */
  readonly onAvatarUpload?: (file: File, contact: Contact) => Promise<string>;
}
