/**
 * Account Settings Components
 *
 * Modular components for account settings management.
 */

export { AccountSettingsSection } from './AccountSettingsSection';
export { EmailManagementCard } from './EmailManagementCard';
export { SessionManagementCard } from './SessionManagementCard';

export type {
  ClerkEmailAddressResource,
  ClerkEmailVerification,
  ClerkSessionActivity,
  ClerkSessionResource,
  ClerkUserResource,
  EmailStatus,
} from './types';

export {
  extractErrorMessage,
  formatRelativeDate,
  syncEmailToDatabase,
} from './utils';
