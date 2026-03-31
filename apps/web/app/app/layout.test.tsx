import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/providers/ResolvedClientProviders', () => ({
  ResolvedClientProviders: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='resolved-client-providers'>{children}</div>
  ),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('app route layout', () => {
  it('keeps the theme init script outside the client provider boundary', async () => {
    const { default: AppLayout } = await import('./layout');

    render(
      await AppLayout({
        children: <div data-testid='app-child'>workspace</div>,
      })
    );

    const provider = screen.getByTestId('resolved-client-providers');
    expect(provider).toBeInTheDocument();
    expect(screen.getByTestId('app-child')).toBeInTheDocument();

    const themeInitScript = document.querySelector(
      'script[src=\"/theme-init.js\"]'
    );
    expect(themeInitScript).toBeInstanceOf(HTMLScriptElement);
    if (!(themeInitScript instanceof HTMLScriptElement)) {
      throw new Error('Expected theme init script to be rendered');
    }
    expect(provider).not.toContainElement(themeInitScript);
    expect(themeInitScript.nextElementSibling).toBe(provider);
  });
});
