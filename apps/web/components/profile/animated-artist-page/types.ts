import type { Variants } from 'motion/react';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

export interface AnimatedArtistPageProps {
  readonly mode: string;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly subtitle: string;
  readonly showTipButton: boolean;
  readonly showBackButton: boolean;
  readonly enableDynamicEngagement?: boolean;
}

export interface UseAnimatedArtistPageReturn {
  isNavigating: boolean;
  setIsNavigating: (value: boolean) => void;
  prefersReducedMotion: boolean;
  tippingEnabled: boolean;
  pageVariants: Variants;
}
