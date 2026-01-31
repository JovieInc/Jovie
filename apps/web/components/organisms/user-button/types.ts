import type { Artist } from '@/types/db';

export interface UserButtonProps {
  readonly artist?: Artist | null;
  readonly profileHref?: string;
  readonly settingsHref?: string;
  readonly showUserInfo?: boolean;
}

export interface UserDisplayInfo {
  userImageUrl: string | undefined;
  displayName: string;
  userInitials: string;
  contactEmail: string | undefined;
  formattedUsername: string | null;
  profileUrl: string;
  settingsUrl: string;
}
