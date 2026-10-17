import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegalSupportBlock } from './LegalSupportBlock';

describe('LegalSupportBlock', () => {
  it('provides the policy contact with default or document-specific context', () => {
    const { rerender } = render(
      <LegalSupportBlock
        description='Contact us about this policy.'
        email='legal@jov.ie'
      />
    );

    expect(screen.getByText('Need help?')).toBeVisible();
    expect(screen.getByText('Contact us about this policy.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'legal@jov.ie' })).toHaveAttribute(
      'href',
      'mailto:legal@jov.ie'
    );

    rerender(
      <LegalSupportBlock
        title='Copyright questions'
        description='Send a copyright notice.'
        email='copyright@jov.ie'
      />
    );

    expect(screen.getByText('Copyright questions')).toBeVisible();
    expect(screen.queryByText('Need help?')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'copyright@jov.ie' })
    ).toHaveAttribute('href', 'mailto:copyright@jov.ie');
  });
});
