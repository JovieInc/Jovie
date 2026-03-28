import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/script', () => ({
  default: ({
    src,
    strategy,
  }: {
    readonly src: string;
    readonly strategy?: string;
  }) => (
    // Use div instead of script to avoid @next/next/no-sync-scripts lint rule
    <div
      data-testid='theme-init-script'
      data-strategy={strategy}
      data-src={src}
    />
  ),
}));

vi.mock('@/components/providers/ResolvedClientProviders', () => ({
  ResolvedClientProviders: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='resolved-client-providers'>{children}</div>
  ),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('app route layout', () => {
  it('wraps app routes with resolved client providers and theme init script', async () => {
    const { default: AppLayout } = await import('@/app/app/layout');

    render(
      await AppLayout({
        children: <div data-testid='app-child'>workspace</div>,
      })
    );

    expect(screen.getByTestId('resolved-client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('app-child')).toBeInTheDocument();

    const themeInitScript = screen.getByTestId('theme-init-script');
    expect(themeInitScript).toHaveAttribute('data-src', '/theme-init.js');
    expect(themeInitScript).toHaveAttribute(
      'data-strategy',
      'beforeInteractive'
    );
  });
});
