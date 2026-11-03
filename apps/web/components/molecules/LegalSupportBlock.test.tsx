import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegalSupportBlock } from './LegalSupportBlock';

describe('LegalSupportBlock', () => {
  it('links the contact address and shares the TOC text inset', () => {
    const { container } = render(
      <LegalSupportBlock
        description='Questions about your data?'
        email='privacy@jov.ie'
      />
    );

    expect(screen.getByText('Need help?')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'privacy@jov.ie' })
    ).toHaveAttribute('href', 'mailto:privacy@jov.ie');
    // Same px-3 inset as PublicTableOfContents' label and items, so the
    // sidebar reads as one left edge.
    expect(container.firstElementChild).toHaveClass(
      'public-doc-support-block',
      'px-3'
    );
  });
});
