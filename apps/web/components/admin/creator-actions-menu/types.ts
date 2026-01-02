import type { CreatorActionStatus } from '@/components/admin/useCreatorActions';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

export interface CreatorActionsMenuProps {
  profile: AdminCreatorProfileRow;
  isMobile: boolean;
  status: CreatorActionStatus;
  refreshIngestStatus?: CreatorActionStatus;
  onToggleVerification: () => Promise<void>;
  onToggleFeatured: () => Promise<void>;
  onToggleMarketing: () => Promise<void>;
  onRefreshIngest?: () => Promise<void>;
  onSendInvite?: () => void;
  onDelete: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
