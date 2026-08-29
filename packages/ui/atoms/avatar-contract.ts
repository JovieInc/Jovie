/** Canonical Avatar size and shape contract (JOV-942 / JOV-5394). */
export const AVATAR_SIZE_MAP = {
  xs: {
    px: 16,
    text: 'text-3xs',
    dot: 'h-2 w-2',
    dotOffset: '-bottom-px -right-px',
  },
  sm: {
    px: 20,
    text: 'text-3xs',
    dot: 'h-2.5 w-2.5',
    dotOffset: '-bottom-px -right-px',
  },
  md: {
    px: 24,
    text: 'text-2xs',
    dot: 'h-3 w-3',
    dotOffset: '-bottom-0.5 -right-0.5',
  },
  lg: {
    px: 32,
    text: 'text-app',
    dot: 'h-3.5 w-3.5',
    dotOffset: '-bottom-0.5 -right-0.5',
  },
  xl: {
    px: 40,
    text: 'text-mid',
    dot: 'h-4 w-4',
    dotOffset: '-bottom-0.5 -right-0.5',
  },
  '2xl': {
    px: 96,
    text: 'text-2xl',
    dot: 'h-5 w-5',
    dotOffset: '-bottom-1 -right-1',
  },
  'display-sm': {
    px: 112,
    text: 'text-xl',
    dot: 'h-5 w-5',
    dotOffset: '-bottom-1 -right-1',
  },
  'display-md': {
    px: 128,
    text: 'text-2xl',
    dot: 'h-6 w-6',
    dotOffset: '-bottom-1 -right-1',
  },
  'display-lg': {
    px: 160,
    text: 'text-3xl',
    dot: 'h-6 w-6',
    dotOffset: '-bottom-1.5 -right-1.5',
  },
  'display-xl': {
    px: 192,
    text: 'text-3xl',
    dot: 'h-7 w-7',
    dotOffset: '-bottom-1.5 -right-1.5',
  },
  'display-2xl': {
    px: 224,
    text: 'text-4xl',
    dot: 'h-7 w-7',
    dotOffset: '-bottom-2 -right-2',
  },
  'display-3xl': {
    px: 256,
    text: 'text-4xl',
    dot: 'h-8 w-8',
    dotOffset: '-bottom-2 -right-2',
  },
  'display-4xl': {
    px: 384,
    text: 'text-5xl',
    dot: 'h-8 w-8',
    dotOffset: '-bottom-2 -right-2',
  },
} as const;

export const AVATAR_SIZE_NAMES = Object.keys(
  AVATAR_SIZE_MAP
) as readonly AvatarSize[];

export type AvatarSize = keyof typeof AVATAR_SIZE_MAP;

export const AVATAR_SHAPE_NAMES = ['person', 'artwork'] as const;
export type AvatarShape = (typeof AVATAR_SHAPE_NAMES)[number];

export const AVATAR_RING_CLASSNAME = 'ring-2 ring-surface-page';

export const AVATAR_OUTLINE_CLASSNAME =
  'outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10';

export const AVATAR_PERSON_RADIUS_CLASSNAME = 'rounded-full';

export function getAvatarArtworkRadiusClassName(sizePx: number): string {
  if (sizePx <= 48) return 'rounded-xs';
  if (sizePx >= 160) return 'rounded-xl';
  return 'rounded-lg';
}

export const getAvatarSizePx = (size: AvatarSize): number =>
  AVATAR_SIZE_MAP[size].px;

export function getAvatarShapeClassName(
  shape: AvatarShape,
  sizePx: number
): string {
  if (shape === 'person') return AVATAR_PERSON_RADIUS_CLASSNAME;
  return getAvatarArtworkRadiusClassName(sizePx);
}
