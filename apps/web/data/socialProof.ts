import type { ComponentType, SVGProps } from 'react';
import { FALLBACK_AVATARS } from '@/components/features/home/featured-creators-fallback';
import {
  ArmadaMusicLogo,
  AwalLogo,
  TheOrchardLogo,
  UniversalMusicGroupLogo,
} from '@/components/features/home/label-logos';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

type LogoComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface ArtistProfileSocialProofCard {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
  readonly src: string;
  readonly supportingLine: string;
}

export interface ArtistProfileQuote {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly quote: string;
  readonly image?: string | null;
}

export interface ArtistProfileSocialProofLogo {
  readonly id: 'awal' | 'the-orchard' | 'universal' | 'armada';
  readonly label: string;
  readonly component: LogoComponent;
}

export interface ArtistProfileSocialProofData {
  readonly proofWhisper: string;
  readonly logos: readonly ArtistProfileSocialProofLogo[];
  readonly profileCards: readonly ArtistProfileSocialProofCard[];
  readonly quotes: readonly ArtistProfileQuote[];
  readonly founderQuote?: {
    readonly quote: string;
    readonly name: string;
    readonly role: string;
    readonly avatarSrc: string;
    readonly spotifyArtistId: string;
    readonly profileHref: string;
    readonly profileLabel: string;
  };
  readonly founderFallback: string;
  readonly hasRealQuotes: boolean;
}

const ARTIST_PROFILE_PROOF_LOGOS: readonly ArtistProfileSocialProofLogo[] = [
  {
    id: 'awal',
    label: 'AWAL',
    component: AwalLogo,
  },
  {
    id: 'the-orchard',
    label: 'The Orchard',
    component: TheOrchardLogo,
  },
  {
    id: 'universal',
    label: 'Universal Music Group',
    component: UniversalMusicGroupLogo,
  },
  {
    id: 'armada',
    label: 'Armada Music',
    component: ArmadaMusicLogo,
  },
] as const;

const ARTIST_PROFILE_PROOF_CARDS: readonly ArtistProfileSocialProofCard[] =
  FALLBACK_AVATARS.slice(0, 3).map(card => ({
    id: card.id,
    handle: card.handle,
    name: card.name,
    src: card.src,
    supportingLine: card.latestReleaseTitle ?? card.tagline ?? 'Live profile',
  }));

const ARTIST_PROFILE_QUOTES: readonly ArtistProfileQuote[] = [];

export const ARTIST_PROFILE_SOCIAL_PROOF: ArtistProfileSocialProofData = {
  proofWhisper: ARTIST_PROFILE_COPY.hero.proofWhisper,
  logos: ARTIST_PROFILE_PROOF_LOGOS,
  profileCards: ARTIST_PROFILE_PROOF_CARDS,
  quotes: ARTIST_PROFILE_QUOTES,
  founderQuote: {
    quote:
      'We built Jovie because we were tired of stitching together tools made for fashion influencers just to promote our music.',
    name: TIM_WHITE_PROFILE.name,
    role: 'Founder, Jovie',
    avatarSrc: TIM_WHITE_PROFILE.avatarSrc,
    spotifyArtistId: TIM_WHITE_PROFILE.spotifyArtistId,
    profileHref: TIM_WHITE_PROFILE.publicProfileUrl,
    profileLabel: TIM_WHITE_PROFILE.publicProfileDisplay,
  },
  founderFallback:
    'Built from real music-marketing and release workflow experience.',
  hasRealQuotes: ARTIST_PROFILE_QUOTES.length >= 3,
} as const;
