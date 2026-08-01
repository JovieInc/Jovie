import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CREATE_MERCH_HREF, InstantMerchLanding } from './InstantMerchLanding';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('InstantMerchLanding', () => {
  it('routes both CTAs into the authenticated merch conversation', () => {
    render(<InstantMerchLanding />);

    expect(screen.getByTestId('instant-merch-primary-cta')).toHaveAttribute(
      'href',
      CREATE_MERCH_HREF
    );
    expect(screen.getByTestId('instant-merch-final-cta')).toHaveAttribute(
      'href',
      CREATE_MERCH_HREF
    );
    expect(CREATE_MERCH_HREF).toBe('/app/chat?q=Make%20me%20merch');
  });

  it('keeps the landing composition responsive at the layout boundaries', () => {
    render(<InstantMerchLanding />);

    expect(screen.getByTestId('marketing-section-how-it-works')).toHaveClass(
      'py-16',
      'sm:py-20'
    );
    expect(screen.getByTestId('marketing-section-feature-grid')).toHaveClass(
      'py-16',
      'sm:py-20'
    );
    expect(screen.getByText('Describe the drop').closest('div')).toBeTruthy();
    expect(screen.getByText('Choose a direction').closest('div')).toBeTruthy();
    expect(
      screen.getByText('Approve the next step').closest('div')
    ).toBeTruthy();
  });

  it('has no axe violations in the rendered marketing surface', async () => {
    const { container } = render(<InstantMerchLanding />);

    await expectNoA11yViolations(container);
  });
});
