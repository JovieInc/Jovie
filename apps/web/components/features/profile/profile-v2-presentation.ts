import type {
  ProfileMode,
  ProfileV2OverlayMode,
  SwipeableProfileMode,
} from '@/features/profile/contracts';

export interface ProfileV2Presentation {
  readonly initialPane: SwipeableProfileMode;
  readonly initialOverlay: ProfileV2OverlayMode;
}

export function resolveProfileV2Presentation(
  mode: ProfileMode
): ProfileV2Presentation {
  switch (mode) {
    case 'tour':
      return { initialPane: 'tour', initialOverlay: null };
    case 'tip':
      return { initialPane: 'tip', initialOverlay: null };
    case 'about':
      return { initialPane: 'about', initialOverlay: null };
    case 'listen':
      return { initialPane: 'profile', initialOverlay: 'listen' };
    case 'subscribe':
      return { initialPane: 'profile', initialOverlay: 'subscribe' };
    case 'contact':
      return { initialPane: 'profile', initialOverlay: 'contact' };
    case 'profile':
    default:
      return { initialPane: 'profile', initialOverlay: null };
  }
}
