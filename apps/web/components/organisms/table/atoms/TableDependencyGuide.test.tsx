import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TableDependencyGuide } from './TableDependencyGuide';

describe('TableDependencyGuide', () => {
  it('continues the decorative dependency line through intermediate children', () => {
    render(<TableDependencyGuide />);
    const guide = screen.getByTestId('table-dependency-guide');
    expect(guide).toHaveAttribute('aria-hidden', 'true');
    expect(guide).toHaveClass('w-6');
    expect(guide.firstElementChild).toHaveClass('bottom-0');
    expect(guide.firstElementChild).not.toHaveClass('h-1/2');
  });

  it('ends the line at the final child while preserving its shared gutter', () => {
    render(<TableDependencyGuide last />);
    const guide = screen.getByTestId('table-dependency-guide');
    expect(guide).toHaveAttribute('data-last', 'true');
    expect(guide).toHaveClass('w-6');
    expect(guide.firstElementChild).toHaveClass('h-1/2');
    expect(guide.firstElementChild).not.toHaveClass('bottom-0');
  });
});
