import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarDock } from './SidebarDock';
import {
  SidebarDockStatusProvider,
  usePublishSidebarDockStatus,
  useSidebarDockStatus,
} from './sidebar-dock-status';

function Reader({ onRender }: { readonly onRender?: () => void }) {
  onRender?.();
  return <p data-testid='status'>{useSidebarDockStatus()?.label ?? 'none'}</p>;
}

function Footer({ label }: { readonly label: string }) {
  const publish = usePublishSidebarDockStatus();
  return (
    <SidebarDock
      userId='u'
      collapsed
      updateControl={{ visible: true, label, urgent: false, node: null }}
      onStatusChange={publish}
    />
  );
}

describe('sidebar dock status', () => {
  it('carries the dock status from the footer to a reader above it', () => {
    render(
      <SidebarDockStatusProvider>
        <Reader />
        <Footer label='Update available' />
      </SidebarDockStatusProvider>
    );
    expect(screen.getByTestId('status')).toHaveTextContent('Update available');
  });

  it('defaults to no status without a provider', () => {
    function Publish() {
      const publish = usePublishSidebarDockStatus();
      useEffect(() => publish({ label: 'x', badges: null }), [publish]);
      return null;
    }
    render(
      <>
        <Reader />
        <Publish />
      </>
    );
    expect(screen.getByTestId('status')).toHaveTextContent('none');
  });

  it('does not re-render readers when the footer re-renders with the same label', () => {
    const onRender = vi.fn();
    const tree = (
      <SidebarDockStatusProvider>
        <Reader onRender={onRender} />
        <Footer label='Update available' />
      </SidebarDockStatusProvider>
    );
    const { rerender } = render(tree);
    const settled = onRender.mock.calls.length;
    rerender(tree);
    expect(onRender.mock.calls.length).toBe(settled);
  });
});
