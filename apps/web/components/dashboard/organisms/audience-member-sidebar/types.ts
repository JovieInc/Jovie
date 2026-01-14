import type { AudienceMember } from '@/types';

export interface AudienceMemberSidebarProps {
  member: AudienceMember | null;
  isOpen: boolean;
  onClose: () => void;
}
