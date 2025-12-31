'use client';

/**
 * ContactSidebar Component
 *
 * @deprecated This file is maintained for backwards compatibility.
 * Import from '@/components/organisms/contact-sidebar' for new code.
 *
 * A sidebar component for displaying and editing contact details,
 * including avatar, name, username, and social links.
 */

// Re-export everything from the modular structure for backwards compatibility
export {
  ContactSidebar,
  type ContactSidebarProps,
  extractUsernameFromLabel,
  extractUsernameFromUrl,
  formatUsername,
  isFormElement,
  isValidUrl,
  sanitizeUsernameInput,
} from './contact-sidebar/index';
