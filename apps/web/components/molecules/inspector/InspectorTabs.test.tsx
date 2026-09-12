import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InspectorTabs } from './InspectorTabs';
import { LIBRARY_INSPECTOR_TABS } from './inspector-tabs';

describe('InspectorTabs', () => {
  it('renders the library tabs with the underline variant and panel wiring', () => {
    render(
      <InspectorTabs
        value='details'
        onValueChange={() => undefined}
        options={LIBRARY_INSPECTOR_TABS}
        ariaLabel='Inspector tabs'
        panelId='inspector-tab-panel'
      />
    );

    const tablist = screen.getByRole('tablist', { name: 'Inspector tabs' });
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-controls',
      'inspector-tab-panel'
    );
    expect(
      screen.queryByRole('tab', { name: 'Presence' })
    ).not.toBeInTheDocument();
  });
});
