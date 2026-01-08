/**
 * ReleaseSidebar Module
 *
 * A sidebar component for displaying and editing release details,
 * including artwork, title, release date, and DSP links.
 */

export { ReleaseSidebar } from './ReleaseSidebar';
export type {
  DspLink,
  Release,
  ReleaseSidebarMode,
  ReleaseSidebarProps,
} from './types';
export type { UseReleaseSidebarReturn } from './useReleaseSidebar';
export { useReleaseSidebar } from './useReleaseSidebar';
export {
  formatReleaseDate,
  formatReleaseDateShort,
  isFormElement,
  isValidUrl,
} from './utils';
