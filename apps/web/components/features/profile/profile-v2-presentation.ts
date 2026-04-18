import type {
  ProfileMode,
  ProfileV2OverlayMode,
} from '@/features/profile/contracts';

export interface ProfileV2Presentation {
  readonly initialOverlay: ProfileV2OverlayMode;
  readonly scrollTarget: 'about' | 'tour' | null;
}

export function resolveProfileV2Presentation(
  mode: ProfileMode
): ProfileV2Presentation {
  switch (mode) {
    case 'tour':
      return { initialOverlay: null, scrollTarget: 'tour' };
    case 'pay':
      return { initialOverlay: 'pay', scrollTarget: null };
    case 'about':
      return { initialOverlay: null, scrollTarget: 'about' };
    case 'listen':
      return { initialOverlay: 'listen', scrollTarget: null };
    case 'subscribe':
      return { initialOverlay: 'subscribe', scrollTarget: null };
    case 'contact':
      return { initialOverlay: 'contact', scrollTarget: null };
    case 'profile':
    default:
      return { initialOverlay: null, scrollTarget: null };
  }
}
