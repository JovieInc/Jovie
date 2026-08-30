import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerInspectorGrid } from './DrawerInspectorGrid';

describe('DrawerInspectorGrid', () => {
  it('publishes the label-width contract to its children', () => {
    render(
      <DrawerInspectorGrid labelWidth={128} data-testid='inspector-grid'>
        <span>Status</span>
      </DrawerInspectorGrid>
    );

    const grid = screen.getByTestId('inspector-grid');
    expect(grid).toHaveTextContent('Status');
    expect(grid).toHaveStyle({ '--drawer-inspector-label-width': '128px' });
  });
});
