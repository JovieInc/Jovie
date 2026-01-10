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
  contact: Contact | null;
  mode: ContactSidebarMode;
  isOpen: boolean;
  onClose?: () => void;
  onRefresh?: () => void;
  onContactChange?: (contact: Contact) => void;
  onSave?: (contact: Contact) => void | Promise<void> | Promise<boolean>;
  isSaving?: boolean;
  /**
   * Optional avatar upload handler. When provided and mode === 'admin',
   * the avatar becomes uploadable and this callback is used to obtain
   * the new avatar URL. The updated URL will be merged into the contact
   * and emitted via onContactChange.
   */
  onAvatarUpload?: (file: File, contact: Contact) => Promise<string>;
}
