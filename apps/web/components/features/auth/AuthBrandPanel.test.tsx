import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  AuthBrandPanel,
  DEFAULT_AUTH_BRAND_DESCRIPTION,
  DEFAULT_AUTH_BRAND_HEADLINE,
} from './AuthBrandPanel';

// State and accessibility coverage for each AuthBrandPanel state. The frame
// and image contract lives in tests/unit/auth/AuthBrandPanel.test.tsx.
describe('AuthBrandPanel states', () => {
  it('renders the default headline, description and product preview', async () => {
    const { container } = render(<AuthBrandPanel />);

    expect(
      screen.getByRole('region', { name: 'Product Preview' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: DEFAULT_AUTH_BRAND_HEADLINE,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(DEFAULT_AUTH_BRAND_DESCRIPTION)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('draws its hairline with the fixed on-media white so the dark panel edge holds in both themes', () => {
    render(<AuthBrandPanel />);

    const panel = screen.getByTestId('auth-brand-panel');
    expect(panel).toHaveClass('border', 'border-on-media/[0.05]');
    expect(panel.className).not.toMatch(/\bborder-white\b/);
  });

  it('renders a headline without a description line', async () => {
    const { container } = render(
      <AuthBrandPanel headline='Be found. Be understood.' description='' />
    );

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Be found. Be understood.',
    });
    expect(heading.parentElement?.querySelector('p')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps the preview and drops the copy when the text is hidden', async () => {
    const { container } = render(<AuthBrandPanel showText={false} />);

    expect(
      screen.getByRole('region', { name: 'Product Preview' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(
      screen.queryByText(DEFAULT_AUTH_BRAND_DESCRIPTION)
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('balances a long headline inside a right-to-left page', async () => {
    const headline =
      'Every release, every link and every fan conversation in one living profile';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AuthBrandPanel headline={headline} />
      </div>
    );

    const heading = screen.getByRole('heading', { level: 2, name: headline });
    expect(heading).toHaveClass('text-balance');
    await expectNoA11yViolations(container);
  });
});
