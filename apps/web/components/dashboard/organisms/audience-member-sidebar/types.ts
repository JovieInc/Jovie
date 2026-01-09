import type { AudienceMember } from '@/types';

export const AUDIENCE_MEMBER_SIDEBAR_WIDTH = 320;

export interface AudienceMemberSidebarProps {
  member: AudienceMember | null;
  isOpen: boolean;
  onClose: () => void;
}
