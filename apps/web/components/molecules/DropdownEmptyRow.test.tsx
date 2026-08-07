import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DropdownEmptyRow } from './DropdownEmptyRow';

describe('DropdownEmptyRow', () => {
  it('renders the message text', () => {
    render(<DropdownEmptyRow message='No options found' />);

    expect(screen.getByText('No options found')).toBeInTheDocument();
  });
});
