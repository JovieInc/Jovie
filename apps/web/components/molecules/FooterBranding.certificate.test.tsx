import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FooterBranding } from './FooterBranding';

describe('FooterBranding certificate', () => {
  it('writes the text mark and claim link in sentence case, not forced caps', async () => {
    const { container } = render(
      <FooterBranding mark='text' showCTA artistHandle='nova' />
    );
    const claim = screen.getByRole('link', { name: 'Claim your handle' });
    expect(claim).toHaveAttribute(
      'href',
      '/start?utm_source=profile&utm_artist=nova'
    );
    expect(claim.className).not.toMatch(/\buppercase\b/);
    const home = screen.getByRole('link', { name: 'Powered by Jovie Home' });
    expect(home.className).not.toMatch(/\buppercase\b/);
    expect(home).toHaveClass('text-secondary-token');
    await expectNoA11yViolations(container);
  });

  it('links to the plain routes with no artist handle', async () => {
    const { container } = render(<FooterBranding mark='text' showCTA />);
    expect(
      screen.getByRole('link', { name: 'Claim your handle' })
    ).toHaveAttribute('href', '/start');
    await expectNoA11yViolations(container);
  });

  it('renders the brand mark right to left without violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <FooterBranding mark='brand' variant='linear' showCTA={false} />
      </div>
    );
    expect(
      screen.getByRole('link', { name: 'Made with Jovie' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
