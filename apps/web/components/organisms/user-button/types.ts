import type { Artist } from '@/types/db';

export interface UserButtonProps {
  artist?: Artist | null;
  profileHref?: string;
  settingsHref?: string;
  showUserInfo?: boolean;
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
