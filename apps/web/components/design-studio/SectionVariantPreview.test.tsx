import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionVariantPreview } from './SectionVariantPreview';

describe('SectionVariantPreview', () => {
  it('renders an unknown-variant message with the error token, not raw red-* (JOV-6773)', () => {
    render(<SectionVariantPreview variantId='nonexistent-variant' />);

    const message = screen.getByText(
      'Unknown section variant: nonexistent-variant'
    );
    expect(message.className).toContain('text-error');
    expect(message.className).not.toMatch(/\bred-\d/);
  });

  it('renders the registered variant when the id is known', () => {
    render(<SectionVariantPreview variantId='marketing-header-landing' />);

    expect(
      screen.getByTestId('section-variant-marketing-header-landing')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Unknown section variant/)).toBeNull();
  });
});
