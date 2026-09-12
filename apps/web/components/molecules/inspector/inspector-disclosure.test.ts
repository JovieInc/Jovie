import { describe, expect, it } from 'vitest';
import {
  INSPECTOR_DISCLOSURE_CONTRACT,
  INSPECTOR_DISCLOSURE_LEVELS,
} from './inspector-disclosure';

describe('inspector disclosure hierarchy', () => {
  it('locks L1–L4 to visible / ⓘ / disclosure / dedicated overflow', () => {
    expect(INSPECTOR_DISCLOSURE_LEVELS).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(INSPECTOR_DISCLOSURE_CONTRACT).toEqual({
      l1: 'always-visible',
      l2: 'info-popover',
      l3: 'disclosure-row',
      l4: 'overflow-or-dedicated',
    });
  });
});
