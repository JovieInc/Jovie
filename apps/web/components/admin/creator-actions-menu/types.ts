import type { CreatorActionStatus } from '@/components/admin/useCreatorActions';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

export interface CreatorActionsMenuProps {
  readonly profile: AdminCreatorProfileRow;
  readonly isMobile: boolean;
  readonly status: CreatorActionStatus;
  readonly refreshIngestStatus?: CreatorActionStatus;
  readonly onToggleVerification: () => Promise<void>;
  readonly onToggleFeatured: () => Promise<void>;
  readonly onToggleMarketing: () => Promise<void>;
  readonly onRefreshIngest?: () => Promise<void>;
  readonly onSendInvite?: () => void;
  readonly onDelete: () => void;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}
