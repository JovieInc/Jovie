import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepageHeroLight } from './HomepageHeroLight';

vi.mock('./hero-light-gl', () => ({
  startHeroLight: vi.fn(() => ({ stop: vi.fn() })),
}));

function stubMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('HomepageHeroLight certificate', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('paints the static poster out of the accessibility tree', async () => {
    stubMotion(false);
    const { container } = render(
      <main>
        <h1>Be found. Be understood.</h1>
        <HomepageHeroLight animate={false} />
      </main>
    );

    const light = screen.getByTestId('homepage-hero-light');
    expect(light).toHaveAttribute('aria-hidden', 'true');
    expect(light).toHaveAttribute('data-renderer', 'css');
    expect(light).toHaveAttribute('data-animate', 'false');
    expect(light.querySelector('canvas')).toBeNull();
    expect(light.textContent).toBe('');
    await expectNoA11yViolations(container);
  });

  it('stays a poster under reduced motion even when the budget enables it', async () => {
    stubMotion(true);
    const { container } = render(<HomepageHeroLight animate />);

    const light = screen.getByTestId('homepage-hero-light');
    expect(light).toHaveAttribute('data-animate', 'true');
    expect(light).toHaveAttribute('data-live', 'false');
    expect(light).toHaveAttribute('data-renderer', 'css');
    await expectNoA11yViolations(container);
  });
});
