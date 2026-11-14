import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReleaseTaskCategoryGroup } from './ReleaseTaskCategoryGroup';

describe('ReleaseTaskCategoryGroup', () => {
  it('puts the group header on the same px-3 seam as its task rows', () => {
    render(
      <ReleaseTaskCategoryGroup category='Creative' done={1} total={2}>
        <div>Row</div>
      </ReleaseTaskCategoryGroup>
    );

    const toggle = screen.getByRole('button', { name: /Creative/ });
    expect(toggle).toHaveClass('px-3');
    expect(toggle).not.toHaveClass('px-4');
  });

  it('collapses and expands its rows', () => {
    render(
      <ReleaseTaskCategoryGroup category='Creative' done={0} total={1}>
        <div>Row</div>
      </ReleaseTaskCategoryGroup>
    );

    const toggle = screen.getByRole('button', { name: /Creative/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Row')).toBeNull();
  });
});
