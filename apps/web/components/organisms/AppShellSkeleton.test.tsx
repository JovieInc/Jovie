import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AppShellSkeleton } from './AppShellSkeleton';

describe('AppShellSkeleton', () => {
  it('renders the default sidebar and header skeleton', () => {
    const { container } = render(<AppShellSkeleton />);

    expect(container.querySelector('.skeleton')).toBeTruthy();
  });

  it('scopes the Ovie canvas to its loading frame when switching workspaces', () => {
    const { container, rerender } = render(
      <AppShellSkeleton brandVariant='ov' />
    );
    const frame = container.querySelector(
      '[data-app-shell-placeholder="true"]'
    );

    expect(frame).toHaveAttribute('data-app-shell-workspace', 'ov');

    rerender(<AppShellSkeleton brandVariant='jovie' />);

    expect(frame).not.toHaveAttribute('data-app-shell-workspace');
  });

  it.each(['jovie', 'ov'] as const)(
    'reserves the live icon rail width for collapsed %s shells',
    brandVariant => {
      const { container } = render(
        <AppShellSkeleton sidebarCollapsed brandVariant={brandVariant} />
      );
      const sidebar = container.querySelector('.bg-sidebar');
      expect(sidebar).toHaveStyle({ width: '52px' });
      expect(sidebar?.querySelector('[style*="width:"]')).toBeNull();
      expect(
        container.querySelector('[data-app-shell-content-column]')
      ).toBeTruthy();
      expect(
        container.querySelector('[data-app-shell-main-plane]')
      ).toBeTruthy();
    }
  );

  it('reserves the expanded sidebar token by default', () => {
    const { container } = render(<AppShellSkeleton />);
    expect(container.querySelector('.bg-sidebar')).toHaveStyle({
      width: 'var(--app-shell-sidebar-width)',
    });
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

  it('insets the skeleton headers with the same tokens as the loaded shell', () => {
    const { container } = render(<AppShellSkeleton />);

    // Loaded header: px-(--app-shell-header-padding-x). Loaded sidebar
    // header: px-(--app-shell-sidebar-inset). A literal inset here shifts
    // the row sideways when the fallback is replaced.
    const header = container.querySelector('header');
    expect(header).toHaveClass('px-app-header');
    for (const node of container.querySelectorAll(
      '.h-\\(--app-shell-header-height\\)'
    )) {
      expect(node).not.toHaveClass('px-2.5');
    }
    expect(
      container.querySelector('.px-\\(--app-shell-sidebar-inset\\)')
    ).not.toBeNull();
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

  it.each([
    ['default loading', {}],
    ['collapsed sidebar', { sidebarCollapsed: true }],
    ['Ovie brand', { brandVariant: 'ov' as const }],
    ['no sidebar', { sidebar: null }],
    [
      'long main override',
      {
        main: (
          <p>
            Preparing the release workspace for The Extraordinarily Long Album
            Title That Keeps Going Well Past Any Reasonable Line Length
          </p>
        ),
      },
    ],
  ])('has no axe violations in the %s state', async (_label, props) => {
    const { container } = render(<AppShellSkeleton {...props} />);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AppShellSkeleton main={<p>جارٍ تحميل مساحة العمل الخاصة بك…</p>} />
      </div>
    );
    await expectNoA11yViolations(container);
  });
});
