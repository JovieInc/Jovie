import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingPageShell } from './MarketingPageShell';

describe('MarketingPageShell', () => {
  it('renders children inside a relative positioning context', async () => {
    const { container } = render(
      <MarketingPageShell>
        <p>page content</p>
      </MarketingPageShell>
    );

    const content = screen.getByText('page content');
    expect(content).toBeInTheDocument();
    expect(content.parentElement?.className).toContain('relative');
    expect(content.parentElement).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.page
    );
    await expectNoA11yViolations(container);
  });

  it('grows to fill the PublicPageShell main column instead of re-applying viewport height (JOV-4872)', () => {
    const { container } = render(<MarketingPageShell>body</MarketingPageShell>);

    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('grow');
    // The layout-owned PublicPageShell already owns min-h-svh; nesting it
    // here double-applied the fixed-header offset and pushed the footer
    // below the fold on short marketing pages.
    expect(wrapper?.className).not.toContain('min-h-screen');
    expect(wrapper?.className).not.toContain('min-h-svh');
  });

  it('merges page-scoped class hooks onto the wrapper', async () => {
    const { container } = render(
      <MarketingPageShell
        className='system-b-pricing-page'
        penContractId={MARKETING_PEN_CONTRACT_IDS.recipe.homepage}
      >
        body
      </MarketingPageShell>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('system-b-pricing-page');
    expect(wrapper?.className).toContain('relative');
    expect(wrapper).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.recipe.homepage
    );
    await expectNoA11yViolations(container);
  });

  it('wraps right-to-left content without changing it', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingPageShell>
          <h2>غلاف صفحة التسويق</h2>
        </MarketingPageShell>
      </div>
    );

    expect(
      screen.getByRole('heading', { name: 'غلاف صفحة التسويق' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
