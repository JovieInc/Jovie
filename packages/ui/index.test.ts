import { describe, expect, it } from 'vitest';

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
  CloseButtonIcon as RootCloseButtonIcon,
  closeButtonClassName as rootCloseButtonClassName,
  closeButtonStyles as rootCloseButtonStyles,
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
  });
});
