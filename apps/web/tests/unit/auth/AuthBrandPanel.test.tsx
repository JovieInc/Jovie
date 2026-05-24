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

    const preview = screen.getByRole('region', { name: 'Product preview' });

    expect(preview).not.toHaveAttribute('aria-roledescription', 'carousel');
    expect(
      screen.getByTestId('product-screenshot-frame-shell-v1-releases-desktop')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(
        'product-screenshot-frame-design-studio-music-ai-command-desktop'
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('product-screenshot-frame-shell-v1-library-desktop')
    ).not.toBeInTheDocument();
  });
});
