import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerSectionHeading } from './DrawerSectionHeading';

describe('DrawerSectionHeading', () => {
  it('renders a compact Title Case heading with the requested element', () => {
    render(<DrawerSectionHeading as='h3'>Contact Info</DrawerSectionHeading>);

    expect(screen.getByRole('heading', { name: 'Contact Info' })).toHaveClass(
      'text-xs',
      'tracking-normal'
    );
  });
});
