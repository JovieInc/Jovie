import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeaderNav } from '@/components/organisms/HeaderNav';

describe('HeaderNav flyout interactions', () => {
  it('renders primary navigation links', () => {
    render(<HeaderNav />);

    const pricingLinks = screen.getAllByRole('link', { name: 'Pricing' });
    expect(pricingLinks.length).toBeGreaterThan(0);
  });
});
