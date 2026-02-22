import type { Artist } from '@/types/db';

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  verificationStatus?: 'unverified' | 'pending' | 'verified';
  verificationToken?: string | null;
}

export interface SocialsFormProps {
  readonly artist: Artist;
}

export interface UseSocialsFormReturn {
  loading: boolean;
  error: string | undefined;
  success: boolean;
  socialLinks: SocialLink[];
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  removeSocialLink: (index: number) => void;
  updateSocialLink: (
    index: number,
    field: keyof SocialLink,
    value: string
  ) => void;
  scheduleNormalize: (index: number, raw: string) => void;
  handleUrlBlur: (index: number) => void;
  addSocialLink: () => void;
  verifyWebsite: (linkId: string) => Promise<void>;
  verifyingLinkId: string | null;
}
