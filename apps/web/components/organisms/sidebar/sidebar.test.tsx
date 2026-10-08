import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SidebarProvider, useSidebar } from './context';
import { Sidebar } from './sidebar';

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => viewport.mobile,
}));

beforeEach(() => {
  viewport.mobile = false;
  document.cookie = 'sidebar:state=; path=/; max-age=0';
});

it('removes a closed offcanvas rail from keyboard and assistive navigation', () => {
  render(
    <SidebarProvider defaultOpen={false}>
      <Sidebar collapsible='offcanvas'>
        <Link href='/app'>Home</Link>
      </Sidebar>
    </SidebarProvider>
  );
  const rail = screen.getByText('Home').closest('#shell-left-rail');
  expect(rail).toHaveAttribute('data-state', 'closed');
  expect(rail).toHaveAttribute('aria-hidden', 'true');
  expect(rail).toHaveAttribute('inert');
});

it('keeps compact icon navigation reachable without pinning the rail', () => {
  render(
    <SidebarProvider defaultOpen={false}>
      <Sidebar collapsible='icon'>
        <Link href='/app'>Home</Link>
      </Sidebar>
    </SidebarProvider>
  );
  const rail = screen
    .getByRole('link', { name: 'Home' })
    .closest('#shell-left-rail');
  expect(rail).toHaveAttribute('data-rail-pinned', 'false');
  expect(rail).not.toHaveAttribute('inert');
  expect(rail).toHaveStyle({ width: '52px' });
  expect(rail).toHaveClass('transition-shell-rail-allocation');
  expect(rail).not.toHaveClass('transition-[width]');
});

it('physically hides transferred toolbar chrome while the offcanvas rail is closed', () => {
  render(
    <SidebarProvider defaultOpen={false}>
      <Sidebar
        collapsible='offcanvas'
        toolbar={<button type='button'>Old rail toggle</button>}
      >
        <Link href='/app'>Home</Link>
      </Sidebar>
    </SidebarProvider>
  );
  expect(
    screen.getByText('Old rail toggle').closest('[data-sidebar-toolbar]')
  ).toHaveAttribute('hidden');
});

function DrawerFocusFixture() {
  const sidebar = useSidebar();
  const editor = useRef<HTMLInputElement>(null);
  const [continueDraft, setContinueDraft] = useState(false);
  useEffect(() => {
    if (continueDraft && !sidebar.openMobile) editor.current?.focus();
  }, [continueDraft, sidebar.openMobile]);
  return (
    <>
      <button
        type='button'
        data-rail-toggle='left'
        onClick={sidebar.toggleSidebar}
      >
        Open navigation
      </button>
      <input ref={editor} aria-label='Draft' />
      <Sidebar>
        <button type='button'>Drawer action</button>
        <button
          type='button'
          onClick={() => {
            setContinueDraft(true);
            sidebar.closeSidebar?.();
          }}
        >
          Continue draft
        </button>
      </Sidebar>
    </>
  );
}

it('returns keyboard focus to the compact drawer toggle after Escape', async () => {
  viewport.mobile = true;
  const user = userEvent.setup();
  render(
    <SidebarProvider defaultOpen={false}>
      <DrawerFocusFixture />
    </SidebarProvider>
  );
  const toggle = screen.getByRole('button', { name: 'Open navigation' });
  await user.tab();
  expect(toggle).toHaveFocus();
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Drawer action' })).toHaveFocus()
  );
  await user.keyboard('{Escape}');
  await waitFor(() => expect(toggle).toHaveFocus());
});

it('preserves focus transferred to a live editor when the compact drawer closes', async () => {
  viewport.mobile = true;
  const user = userEvent.setup();
  render(
    <SidebarProvider defaultOpen={false}>
      <DrawerFocusFixture />
    </SidebarProvider>
  );
  const draft = screen.getByRole('textbox', { name: 'Draft' });
  await user.click(draft);
  await user.type(draft, 'Keep this draft');
  await user.click(screen.getByRole('button', { name: 'Open navigation' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Drawer action' })).toHaveFocus()
  );
  await user.click(screen.getByRole('button', { name: 'Continue draft' }));
  await waitFor(() => expect(draft).toHaveFocus());
  expect(draft).toHaveValue('Keep this draft');
});
