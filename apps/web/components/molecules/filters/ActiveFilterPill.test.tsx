import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActiveFilterPill } from './ActiveFilterPill';

describe('ActiveFilterPill', () => {
  it('renders nothing without values', () => {
    const { container } = render(
      <ActiveFilterPill groupLabel='Status' values={[]} onClear={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('summarises multiple values with the AA accent text token and clears', () => {
    const onClear = vi.fn();
    render(
      <ActiveFilterPill
        groupLabel='Status'
        values={['Todo', 'Done']}
        onClear={onClear}
      />
    );
    expect(screen.getByText('2 selected')).toHaveClass(
      'text-(--color-accent-purple-text)'
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear Status filter' })
    );
    expect(onClear).toHaveBeenCalledOnce();
  });
});
