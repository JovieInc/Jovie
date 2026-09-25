import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge, validators } from 'tailwind-merge';

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
      // `border-strong` is a theme border color. Without this group it survives
      // next to `border-(--linear-border-default)` and the keycap border flips.
      'border-color': [{ border: ['strong'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return mergeTailwindClasses(clsx(inputs));
}
