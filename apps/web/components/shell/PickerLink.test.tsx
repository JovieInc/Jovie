import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PickerLink } from './PickerLink';

describe('PickerLink', () => {
  it('renders the label', () => {
    render(<PickerLink href='/help' label='Help & docs' />);
    expect(screen.getByText('Help & docs')).toBeInTheDocument();
  });

  it('points the anchor at the supplied href', () => {
    render(<PickerLink href='/help' label='Help' />);
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute(
      'href',
      '/help'
    );
  });
});
