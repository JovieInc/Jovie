import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InspectorEmpty } from './InspectorEmpty';
import { InspectorLoading } from './InspectorLoading';
import { InspectorShell } from './InspectorRail';
import { InspectorRow } from './InspectorRow';
import { InspectorSection } from './InspectorSection';
import { LIBRARY_INSPECTOR_TABS } from './inspector-tabs';

vi.mock('@/components/molecules/drawer/RightDrawer', () => ({
  RightDrawer: ({
    children,
    className,
    'data-testid': testId,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
    readonly 'data-testid'?: string;
  }) => (
    <aside className={className} data-testid={testId ?? 'right-drawer'}>
      {children}
    </aside>
  ),
}));

describe('InspectorShell', () => {
  it('keeps the object header sticky and selects one real tab', async () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <InspectorShell
        isOpen
        ariaLabel='Release inspector'
        objectHeader={<div data-testid='object-header'>Take Me Over</div>}
        tabs={LIBRARY_INSPECTOR_TABS}
        activeTab='details'
        onTabChange={onTabChange}
        tabsAriaLabel='Inspector tabs'
        testId='library-asset-drawer'
      >
        <InspectorSection title='Facts'>
          <InspectorRow label='Type' value='Single' />
        </InspectorSection>
      </InspectorShell>
    );

    const header = screen.getByTestId('entity-sidebar-entity-header');
    const tabs = screen.getByRole('tablist', { name: 'Inspector tabs' });
    const panel = screen.getByTestId('inspector-tab-panel');

    expect(header).toContainElement(screen.getByTestId('object-header'));
    expect(
      header.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      tabs.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    const selected = screen.getByRole('tab', { name: 'Details' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected.className).toContain('border-accent');
    expect(selected.className).toContain('bg-surface-0/80');
    expect(selected.className).not.toContain('rounded-full');

    expect(screen.getByRole('tab', { name: 'Assets' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    expect(
      screen.queryByRole('tab', { name: 'Presence' })
    ).not.toBeInTheDocument();
    expect(container.querySelector('[data-section-collapsible]')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Assets' }));
    expect(onTabChange).toHaveBeenCalledWith('assets');
    await expectNoA11yViolations(container);
  });

  it('moves selection with arrow keys and does not use pill chrome', () => {
    const onTabChange = vi.fn();
    render(
      <InspectorShell
        isOpen
        ariaLabel='Track inspector'
        tabs={LIBRARY_INSPECTOR_TABS}
        activeTab='details'
        onTabChange={onTabChange}
        tabsAriaLabel='Inspector tabs'
      >
        Details body
      </InspectorShell>
    );

    const tablist = screen.getByRole('tablist', { name: 'Inspector tabs' });
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledWith('assets');

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(onTabChange).toHaveBeenCalledWith('rights');

    expect(tablist.className).not.toContain('rounded-full');
  });

  it('renders standardized empty and loading states', () => {
    const { rerender } = render(
      <InspectorShell
        isOpen
        ariaLabel='Empty inspector'
        tabs={LIBRARY_INSPECTOR_TABS}
        activeTab='details'
        onTabChange={() => undefined}
        tabsAriaLabel='Inspector tabs'
        isEmpty
        emptyMessage='Select a library item to view details.'
      >
        Hidden
      </InspectorShell>
    );

    expect(
      screen.getByText('Select a library item to view details.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();

    rerender(
      <InspectorShell
        isOpen
        ariaLabel='Loading inspector'
        tabs={LIBRARY_INSPECTOR_TABS}
        activeTab='details'
        onTabChange={() => undefined}
        tabsAriaLabel='Inspector tabs'
        isLoading
      >
        Hidden
      </InspectorShell>
    );

    expect(screen.getByTestId('inspector-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading inspector')).toBeInTheDocument();
  });

  it('exposes empty and row primitives without accordion chrome', () => {
    render(
      <InspectorSection title='Assets'>
        <InspectorEmpty message='No assets for this object.' />
        <InspectorRow label='ISRC' value='USRC17607839' />
      </InspectorSection>
    );

    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-empty')).toHaveTextContent(
      'No assets for this object.'
    );
    expect(screen.getByText('ISRC')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Assets' })
    ).not.toBeInTheDocument();
  });

  it('renders the loading skeleton with the inline 96px label column', () => {
    render(<InspectorLoading rows={2} />);

    const loading = screen.getByTestId('inspector-loading');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading inspector')).toBeInTheDocument();
    // sr-only label + one skeleton row per requested row count
    expect(loading.children).toHaveLength(3);
  });
});
