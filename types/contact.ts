import type { SocialPlatform } from './db';

export type ContactSidebarMode = 'admin' | 'crm';

export interface ContactSocialLink {
  id?: string;
  label: string;
  url: string;
  platformType?: SocialPlatform | string;
}

export interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  socialLinks: ContactSocialLink[];
}
