import { describe, expect, it } from 'vitest';

import {
  AVATAR_PERSON_RADIUS_CLASSNAME,
  AVATAR_RING_CLASSNAME,
  AVATAR_SHAPE_NAMES,
  AVATAR_SIZE_MAP,
  AVATAR_SIZE_NAMES,
  getAvatarArtworkRadiusClassName,
  getAvatarShapeClassName,
  getAvatarSizePx,
} from './avatar-contract';

const DIVERGED_ADAPTER_SIZE_PX = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 80,
} as const;

describe('avatar contract', () => {
  it('owns one size table with Linear chrome xs-xl and matching display steps', () => {
    expect(AVATAR_SIZE_NAMES).toEqual([
      'xs',
      'sm',
      'md',
      'lg',
      'xl',
      '2xl',
      'display-sm',
      'display-md',
      'display-lg',
      'display-xl',
      'display-2xl',
      'display-3xl',
      'display-4xl',
    ]);
    expect(getAvatarSizePx('xs')).toBe(16);
    expect(getAvatarSizePx('sm')).toBe(20);
    expect(getAvatarSizePx('md')).toBe(24);
    expect(getAvatarSizePx('lg')).toBe(32);
    expect(getAvatarSizePx('xl')).toBe(40);
    expect(getAvatarSizePx('2xl')).toBe(96);
    expect(getAvatarSizePx('display-4xl')).toBe(384);
  });

  it('rejects the historical adapter size-contract divergence', () => {
    for (const size of Object.keys(
      DIVERGED_ADAPTER_SIZE_PX
    ) as (keyof typeof DIVERGED_ADAPTER_SIZE_PX)[]) {
      expect(AVATAR_SIZE_MAP[size].px).not.toBe(DIVERGED_ADAPTER_SIZE_PX[size]);
    }
  });

  it('keeps person avatars circular and artwork rounded-square with existing tokens', () => {
    expect(AVATAR_SHAPE_NAMES).toEqual(['person', 'artwork']);
    expect(getAvatarShapeClassName('person', 24)).toBe(
      AVATAR_PERSON_RADIUS_CLASSNAME
    );
    expect(getAvatarArtworkRadiusClassName(40)).toBe('rounded-xs');
    expect(getAvatarArtworkRadiusClassName(96)).toBe('rounded-lg');
    expect(getAvatarArtworkRadiusClassName(160)).toBe('rounded-xl');
    expect(getAvatarShapeClassName('artwork', 96)).toBe('rounded-lg');
    expect(AVATAR_RING_CLASSNAME).toBe('ring-2 ring-surface-page');
  });
});
