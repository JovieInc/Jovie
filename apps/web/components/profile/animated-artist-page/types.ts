import type { Variants } from 'motion/react';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

export interface AnimatedArtistPageProps {
  mode: string;
  artist: Artist;
  socialLinks: LegacySocialLink[];
  contacts: PublicContact[];
  subtitle: string;
  showTipButton: boolean;
  showBackButton: boolean;
  enableDynamicEngagement?: boolean;
}

export interface UseAnimatedArtistPageReturn {
  isNavigating: boolean;
  setIsNavigating: (value: boolean) => void;
  prefersReducedMotion: boolean;
  tippingEnabled: boolean;
  pageVariants: Variants;
}
