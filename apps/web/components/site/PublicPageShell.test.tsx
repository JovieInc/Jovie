import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { PublicPageShell } from './PublicPageShell';

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => '/',
  };
});

describe('PublicPageShell', () => {
  it('renders children inside main#main-content with the header offset by default', () => {
    const { container } = render(
      <PublicPageShell>
        <p>route content</p>
      </PublicPageShell>
    );

    expect(container.firstElementChild).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.publicPage
    );
    const main = document.getElementById('main-content');
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent('route content');
    expect(main?.className).toContain('pt-(--public-shell-header-offset)');
  });

  it('omits the fixed-header offset when mainOffset is false', () => {
    render(<PublicPageShell mainOffset={false}>hero</PublicPageShell>);

    const main = document.getElementById('main-content');
    expect(main?.className).not.toContain('pt-(--public-shell-header-offset)');
  });

  it('passes footer variant and className through to MarketingFooter', () => {
    render(
      <PublicPageShell
        footerClassName='system-b-mounted-home-footer'
        footerVariant='minimal'
      >
        body
      </PublicPageShell>
    );

    const footer = screen.getByTestId('marketing-footer');
    expect(footer.className).toContain('system-b-mounted-home-footer');
  });

  it('renders the skip-to-content link by default and can disable it', () => {
    const { unmount } = render(<PublicPageShell>body</PublicPageShell>);
    expect(
      screen.getByRole('link', { name: 'Skip to content' })
    ).toBeInTheDocument();
    unmount();

    render(<PublicPageShell skipToContent={false}>body</PublicPageShell>);
    expect(
      screen.queryByRole('link', { name: 'Skip to content' })
    ).not.toBeInTheDocument();
  });
});
