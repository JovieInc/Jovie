import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';

vi.mock('@/components/molecules/drawer/RightDrawer', () => ({
  RightDrawer: ({
    children,
    ariaLabel,
    presentation,
    'data-testid': testId,
  }: {
    readonly children: ReactNode;
    readonly ariaLabel?: string;
    readonly presentation?: string;
    readonly 'data-testid'?: string;
  }) => (
    <aside
      data-presentation={presentation}
      data-testid={testId ?? 'right-drawer'}
      aria-label={ariaLabel}
    >
      {children}
    </aside>
  ),
}));

describe('EntitySidebarShell presentation', () => {
  it('forwards the requested rail presentation to the drawer', () => {
    const { rerender } = render(
      <EntitySidebarShell isOpen ariaLabel='Contact details'>
        <div>Body content</div>
      </EntitySidebarShell>
    );
    expect(screen.getByTestId('right-drawer')).not.toHaveAttribute(
      'data-presentation'
    );
    rerender(
      <EntitySidebarShell
        isOpen
        ariaLabel='Contact details'
        presentation='overlay'
      >
        <div>Body content</div>
      </EntitySidebarShell>
    );
    expect(screen.getByTestId('right-drawer')).toHaveAttribute(
      'data-presentation',
      'overlay'
    );
  });
});
