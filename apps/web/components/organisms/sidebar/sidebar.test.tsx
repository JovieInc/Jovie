import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import { beforeEach, expect, it } from 'vitest';
import { SidebarProvider } from './context';
import { Sidebar } from './sidebar';

beforeEach(() => {
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
