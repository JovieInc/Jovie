import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge, validators } from 'tailwind-merge';

/** Semantic overlay layers from the shared z-index contract. */
export const OVERLAY_Z_LAYERS = [
  'banner',
  'sheet',
  'modal',
  'popover',
  'tooltip',
] as const;

const mergeTailwindClasses = extendTailwindMerge({
  override: {
    classGroups: {
      'font-size': [
        {
          text: [
            '3xs',
            '2xs',
            'app',
            'mid',
            'base',
            validators.isTshirtSize,
            validators.isArbitraryVariableLength,
            validators.isArbitraryLength,
          ],
        },
      ],
    },
  },
  extend: {
    classGroups: {
      z: [{ z: [...OVERLAY_Z_LAYERS] }],
      // `border-strong` is a theme border color. Without this group, tailwind-merge
      // keeps it beside the keycap's arbitrary border utility and the border flips.
      'border-color': [{ border: ['strong'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return mergeTailwindClasses(clsx(inputs));
}
