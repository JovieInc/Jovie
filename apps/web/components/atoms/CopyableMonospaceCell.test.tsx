import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CopyableMonospaceCell } from './CopyableMonospaceCell';

describe('CopyableMonospaceCell', () => {
  it('keeps the visible value inside the accessible name (label-content-name-mismatch)', () => {
    render(<CopyableMonospaceCell value='USRC17607839' label='ISRC' />);

    const button = screen.getByRole('button');
    expect(button).toHaveAccessibleName('Copy ISRC: USRC17607839');
    expect(button).toHaveTextContent('USRC17607839');
  });

  it('renders an em dash placeholder when there is no value', () => {
    render(<CopyableMonospaceCell value={null} label='ISRC' />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
