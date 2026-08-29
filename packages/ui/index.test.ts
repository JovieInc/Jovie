import { describe, expect, it } from 'vitest';
import {
  AVATAR_SIZE_MAP as CanonicalAvatarSizeMap,
  getAvatarSizePx as canonicalGetAvatarSizePx,
} from './atoms/avatar-contract';
import {
  CloseButtonIcon as CanonicalCloseButtonIcon,
  closeButtonClassName as canonicalCloseButtonClassName,
  closeButtonStyles as canonicalCloseButtonStyles,
} from './atoms/close-button';
import {
  CloseButtonIcon as AtomIndexCloseButtonIcon,
  closeButtonClassName as atomIndexCloseButtonClassName,
  closeButtonStyles as atomIndexCloseButtonStyles,
} from './atoms/index';
import {
  AVATAR_SIZE_MAP as RootAvatarSizeMap,
  CloseButtonIcon as RootCloseButtonIcon,
  closeButtonClassName as rootCloseButtonClassName,
  closeButtonStyles as rootCloseButtonStyles,
  getAvatarSizePx as rootGetAvatarSizePx,
} from './index';

describe('@jovie/ui public exports', () => {
  it('exposes the canonical close-button contract from the root barrel', () => {
    expect(RootCloseButtonIcon).toBe(CanonicalCloseButtonIcon);
    expect(rootCloseButtonClassName).toBe(canonicalCloseButtonClassName);
    expect(rootCloseButtonStyles).toBe(canonicalCloseButtonStyles);
  });

  it('keeps the supported atoms index aligned with the root contract', () => {
    expect(AtomIndexCloseButtonIcon).toBe(RootCloseButtonIcon);
    expect(atomIndexCloseButtonClassName).toBe(rootCloseButtonClassName);
    expect(atomIndexCloseButtonStyles).toBe(rootCloseButtonStyles);
    expect(RootAvatarSizeMap).toBe(CanonicalAvatarSizeMap);
    expect(rootGetAvatarSizePx).toBe(canonicalGetAvatarSizePx);
  });
});
