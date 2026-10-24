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

  it('announces the first-boot load as a text-legible status (JOV-8791)', () => {
    // The skeleton is all shapes; without a status line its text content is
    // empty, so screen readers and text-based probes see a blank page for the
    // entire first-boot load.
    const { container } = render(<AppShellSkeleton />);

    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status?.textContent).toContain('Loading your workspace');
  });

  it('announces the load even with custom main/sidebar overrides (JOV-8791)', () => {
    const { container } = render(<AppShellSkeleton sidebar={null} />);

    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status?.textContent).toContain('Loading your workspace');
  });
});
