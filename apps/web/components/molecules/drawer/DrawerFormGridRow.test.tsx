import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerFormGridRow } from './DrawerFormGridRow';

describe('DrawerFormGridRow', () => {
  it('keeps the grid label connected to the inline form control', () => {
    render(
      <DrawerFormGridRow label='Release date' htmlFor='release-date'>
        <input id='release-date' />
      </DrawerFormGridRow>
    );

    const input = screen.getByLabelText('Release date');
    expect(input).toHaveAttribute('id', 'release-date');
    expect(input.parentElement).toHaveStyle({
      gridTemplateColumns:
        'var(--drawer-inspector-label-width, 92px) minmax(0, 1fr)',
    });
  });
});
