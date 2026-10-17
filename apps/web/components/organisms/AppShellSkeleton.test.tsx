import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellSkeleton } from './AppShellSkeleton';

describe('AppShellSkeleton', () => {
  it('renders the default sidebar and header skeleton', () => {
    const { container } = render(<AppShellSkeleton />);

    expect(container.querySelector('.skeleton')).toBeTruthy();
  });

  it('uses the single unified header-height token for the sidebar and header skeletons (founder lock 2026-09-25)', () => {
    const { container } = render(<AppShellSkeleton />);

    const tokenNodes = container.querySelectorAll(
      '.h-\\(--app-shell-header-height\\)'
    );
    expect(tokenNodes.length).toBeGreaterThan(0);
    expect(
      container.querySelector('[class*="--app-shell-header-height-compact"]')
    ).toBeNull();
  });

  it('renders an explicit null sidebar override without the default nav skeleton', () => {
    const { container } = render(<AppShellSkeleton sidebar={null} />);

    expect(container.querySelector('.bg-sidebar')).toBeNull();
  });

  it('does not reuse the live shell landmark while the fallback is mounted', () => {
    const { container } = render(<AppShellSkeleton />);

    expect(container.querySelector('#main-content')).toBeNull();
    expect(container.querySelector('[data-app-shell-frame]')).toBeNull();
    expect(
      container.querySelector('[data-app-shell-placeholder="true"]')
    ).toBeTruthy();
    expect(container.querySelector('main')).toBeTruthy();
  });
});
