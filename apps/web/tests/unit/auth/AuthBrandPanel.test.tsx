import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/marketing/ProductScreenshotFrame', () => ({
  ProductScreenshotFrame: ({ scenarioId }: { readonly scenarioId: string }) => (
    <div
      data-testid={`product-screenshot-frame-${scenarioId}`}
      data-scenario-id={scenarioId}
    />
  ),
}));

import { AuthBrandPanel } from '@/components/features/auth/AuthBrandPanel';

describe('AuthBrandPanel', () => {
  it('renders a single static first product frame instead of a carousel', () => {
    render(<AuthBrandPanel />);

    const preview = screen.getByRole('region', { name: 'Product Preview' });

    expect(preview).not.toHaveAttribute('aria-roledescription', 'carousel');
    expect(
      screen.getByTestId(
        'product-screenshot-frame-dashboard-releases-sidebar-desktop'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(
        'product-screenshot-frame-design-studio-music-ai-command-desktop'
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(
        'product-screenshot-frame-design-studio-shell-library-desktop'
      )
    ).not.toBeInTheDocument();
  });

  it('uses the noir studio image as a decorative, high-contrast-safe layer', () => {
    const { container } = render(<AuthBrandPanel />);

    const backdrop = container.querySelector('img[alt=""]');

    expect(backdrop).toHaveAttribute('alt', '');
    expect(backdrop).toHaveClass('forced-colors:hidden');
  });

  it('renders optional auth shell copy without changing the panel owner', () => {
    render(
      <AuthBrandPanel
        headline='Welcome to Jovie'
        description='Create your artist profile today.'
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Welcome to Jovie' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Create your artist profile today.')
    ).toBeInTheDocument();
  });

  it('can hide compatibility copy while preserving the product frame', () => {
    render(<AuthBrandPanel headline='Hidden copy' showText={false} />);

    expect(
      screen.getByTestId(
        'product-screenshot-frame-dashboard-releases-sidebar-desktop'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Hidden copy' })
    ).not.toBeInTheDocument();
  });
});
