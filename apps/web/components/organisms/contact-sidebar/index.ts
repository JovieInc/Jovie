/**
 * ContactSidebar Module
 *
 * A sidebar component for displaying and editing contact details,
 * including avatar, name, username, and social links.
 */

export { ContactSidebar } from './ContactSidebar';
export type { ContactSidebarProps } from './types';
export type { UseContactSidebarReturn } from './useContactSidebar';
export { useContactSidebar } from './useContactSidebar';
export {
  extractUsernameFromLabel,
  extractUsernameFromUrl,
  formatUsername,
  isFormElement,
  isValidUrl,
  sanitizeUsernameInput,
} from './utils';
