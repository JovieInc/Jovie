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
});

export function cn(...inputs: ClassValue[]) {
  return mergeTailwindClasses(clsx(inputs));
}
