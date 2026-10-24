import { render, screen, waitFor } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import { RenderedFamily } from './rendered-family';

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));

vi.mock('@/components/organisms/sidebar', () => ({
  useSidebar: vi.fn(),
}));

describe('RenderedFamily keyboard target contract', () => {
  it('measures the actual portal instead of certifying its empty story wrapper', async () => {
    const story = (opened: boolean) => (
      <RenderedFamily
        name='portal-fixture'
        owner='portal-fixture.tsx'
        interactive
        targetSelector='[data-testid="portal-rail"]'
        surfaceToken='--app-shell-content-surface'
      >
        {opened &&
          createPortal(
            <aside data-testid='portal-rail'>
              <div>
                <button type='button'>Close rail</button>
              </div>
            </aside>,
            document.body
          )}
      </RenderedFamily>
    );
    const { container, rerender, unmount } = render(story(false));
    rerender(story(true));
    const rail = screen.getByTestId('portal-rail');
    await waitFor(() =>
      expect(rail).toHaveAttribute('data-jovie-eval-family', 'portal-fixture')
    );
    expect(container.querySelector('[data-jovie-eval-family]')).toBeNull();
    expect(rail).toHaveAttribute(
      'data-jovie-eval-surface-token',
      '--app-shell-content-surface'
    );
    const variant = rail.querySelector('[data-jovie-eval-variant]');
    expect(variant).toContainElement(
      screen.getByRole('button', { name: 'Close rail' })
    );
    unmount();
    expect(rail).not.toHaveAttribute('data-jovie-eval-family');
    expect(variant).not.toHaveAttribute('data-jovie-eval-variant');
  });

  it('declares the intended control within the current family and variant', () => {
    const { container } = render(
      <RenderedFamily
        name='claim-fixture'
        owner='claim-fixture.tsx'
        interactive
        keyboardTargetSelector='button[data-testid="claim-target"]'
      >
        <input aria-label='Artist handle' />
        <button type='button' data-testid='claim-target'>
          Claim
        </button>
      </RenderedFamily>
    );

    const family = container.querySelector('[data-jovie-eval-family]');
    const variant = family?.querySelector('[data-jovie-eval-variant]');
    expect(family).toHaveAttribute('data-jovie-eval-family', 'claim-fixture');
    expect(family).toHaveAttribute('data-jovie-eval-theme', 'dark');
    expect(variant).toHaveAttribute('data-jovie-eval-interactive', 'true');
    const selector = variant?.getAttribute(
      'data-jovie-eval-keyboard-target-selector'
    );
    expect(selector).toBe('button[data-testid="claim-target"]');
    expect(variant?.querySelectorAll(selector!)).toHaveLength(1);
    expect(variant?.querySelector(selector!)).toBe(
      screen.getByRole('button', { name: 'Claim' })
    );
    expect(variant?.querySelector('input')).toBe(
      screen.getByRole('textbox', { name: 'Artist handle' })
    );
  });

  it('omits an undeclared target so existing stories keep default discovery', () => {
    const { container } = render(
      <RenderedFamily
        name='existing-fixture'
        owner='existing-fixture.tsx'
        interactive={false}
      >
        Existing story
      </RenderedFamily>
    );

    const variant = container.querySelector('[data-jovie-eval-variant]');
    expect(variant).toHaveAttribute('data-jovie-eval-interactive', 'false');
    expect(variant).not.toHaveAttribute(
      'data-jovie-eval-keyboard-target-selector'
    );
    expect(variant).toHaveTextContent('Existing story');
  });
});
