import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DropdownEmptyRow } from './DropdownEmptyRow';
import { expectFlatState } from '@/tests/utils/flat-state';

describe('DropdownEmptyRow', () => {
  it('renders the message text', () => {
    render(<DropdownEmptyRow message='No options found' />);

    expect(screen.getByText('No options found')).toBeInTheDocument();
  });

  it('sits flat with no fill behind the message', () => {
    const { container } = render(<DropdownEmptyRow message='No options' />);

    expectFlatState(container);
  });
});
