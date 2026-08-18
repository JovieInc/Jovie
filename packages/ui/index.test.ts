import { describe, expect, it } from 'vitest';

import {
  CloseButtonIcon,
  closeButtonClassName,
  closeButtonStyles,
} from './atoms/close-button';
import {
  CloseButtonIcon as AtomIndexCloseButtonIcon,
  closeButtonClassName as atomIndexCloseButtonClassName,
  closeButtonStyles as atomIndexCloseButtonStyles,
} from './atoms/index';

describe('@jovie/ui public exports', () => {
  it('keeps the supported atoms index aligned with the root contract', () => {
    expect(AtomIndexCloseButtonIcon).toBe(CloseButtonIcon);
    expect(atomIndexCloseButtonClassName).toBe(closeButtonClassName);
    expect(atomIndexCloseButtonStyles).toBe(closeButtonStyles);
  });
});
