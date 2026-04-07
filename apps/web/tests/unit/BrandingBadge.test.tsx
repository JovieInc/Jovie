import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandingBadge } from '@/components/organisms/BrandingBadge';

describe('BrandingBadge', () => {
  it('always renders platform branding', () => {
    render(<BrandingBadge />);
    expect(screen.getByText('Made with Jovie')).toBeInTheDocument();
  });
});
