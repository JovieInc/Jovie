/**
 * Account Settings Components
 *
 * Better Auth identity summary + supported preference sections.
 * Full account-management parity (email/provider/session mutation) is tracked
 * separately — do not reintroduce Clerk resource cast UIs here.
 */

export { AccountSettingsSection } from './AccountSettingsSection';

export {
  extractErrorMessage,
  formatRelativeDate,
  formatSessionDeviceName,
  syncEmailToDatabase,
} from './utils';
