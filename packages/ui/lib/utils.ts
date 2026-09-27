import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge, validators } from 'tailwind-merge';

/** Semantic overlay layers from the z-index contract (JOV-INV-036). */
export const OVERLAY_Z_LAYERS = [
  'banner',
  'sheet',
  'modal',
  'popover',
  'tooltip',
] as const;

const mergeTailwindClasses = extendTailwindMerge({
  extend: {
    classGroups: {
      z: [{ z: [...OVERLAY_Z_LAYERS] }],
    },
  },
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
});

export function cn(...inputs: ClassValue[]) {
  return mergeTailwindClasses(clsx(inputs));
}
