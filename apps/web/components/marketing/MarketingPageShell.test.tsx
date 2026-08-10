import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingPageShell } from './MarketingPageShell';

describe('MarketingPageShell', () => {
  it('renders children inside a relative positioning context', () => {
    render(
      <MarketingPageShell>
        <p>page content</p>
      </MarketingPageShell>
    );

    const content = screen.getByText('page content');
    expect(content).toBeInTheDocument();
    expect(content.parentElement?.className).toContain('relative');
  });

  it('grows to fill the PublicPageShell main column instead of re-applying viewport height (JOV-4872)', () => {
    const { container } = render(<MarketingPageShell>body</MarketingPageShell>);

    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('grow');
    // The layout-owned PublicPageShell already owns min-h-screen; nesting it
    // here double-applied the fixed-header offset and pushed the footer
    // below the fold on short marketing pages.
    expect(wrapper?.className).not.toContain('min-h-screen');
  });

  it('merges page-scoped class hooks onto the wrapper', () => {
    const { container } = render(
      <MarketingPageShell className='system-b-pricing-page'>
        body
      </MarketingPageShell>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('system-b-pricing-page');
    expect(wrapper?.className).toContain('relative');
  });
});
