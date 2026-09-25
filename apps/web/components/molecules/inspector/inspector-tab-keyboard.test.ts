import { describe, expect, it } from 'vitest';
import { nextInspectorTabValue } from './inspector-tab-keyboard';
import { LIBRARY_INSPECTOR_TABS } from './inspector-tabs';

describe('inspector tab keyboard', () => {
  it('walks enabled tabs with arrows and Home/End', () => {
    expect(
      nextInspectorTabValue(LIBRARY_INSPECTOR_TABS, 'details', 'ArrowRight')
    ).toBe('assets');
    expect(
      nextInspectorTabValue(LIBRARY_INSPECTOR_TABS, 'links', 'ArrowLeft')
    ).toBe('assets');
    expect(
      nextInspectorTabValue(LIBRARY_INSPECTOR_TABS, 'assets', 'Home')
    ).toBe('details');
    expect(
      nextInspectorTabValue(LIBRARY_INSPECTOR_TABS, 'details', 'End')
    ).toBe('rights');
    expect(
      nextInspectorTabValue(
        [
          { value: 'details', label: 'Details' },
          { value: 'rights', label: 'Rights' },
        ],
        'details',
        'End'
      )
    ).toBe('rights');
    expect(
      nextInspectorTabValue(LIBRARY_INSPECTOR_TABS, 'details', 'Enter')
    ).toBeNull();
  });

  it('skips disabled tabs', () => {
    expect(
      nextInspectorTabValue(
        [
          { value: 'details', label: 'Details' },
          { value: 'assets', label: 'Assets', disabled: true },
          { value: 'links', label: 'Links' },
        ],
        'details',
        'ArrowRight'
      )
    ).toBe('links');
  });
});
