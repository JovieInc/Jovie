import type { CommonDropdownItem } from '@jovie/ui';
import type { AudienceMember } from '@/types';

export interface AudienceMemberSidebarProps {
  readonly member: AudienceMember | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** Context menu items to show when right-clicking the drawer.
   * These should be the same items used in the table row context menu. */
  readonly contextMenuItems?: CommonDropdownItem[];
}
