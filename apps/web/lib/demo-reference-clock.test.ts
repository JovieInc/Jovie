import { describe, expect, it } from 'vitest';
import { DEMO_REFERENCE_CLOCK_ISO } from './demo-reference-clock';
import { dropDateMeta } from './format-drop-date';

describe('canonical demo reference clock', () => {
  it('keeps the dashboard fixture label stable across SSR and hydration', () => {
    const referenceNow = new Date(DEMO_REFERENCE_CLOCK_ISO);

    expect(dropDateMeta('2025-08-08', referenceNow)).toEqual({
      label: '251d ago',
      tone: 'past',
    });
    expect(dropDateMeta('2025-08-08', referenceNow)).toEqual(
      dropDateMeta('2025-08-08', new Date(DEMO_REFERENCE_CLOCK_ISO))
    );
  });
});
