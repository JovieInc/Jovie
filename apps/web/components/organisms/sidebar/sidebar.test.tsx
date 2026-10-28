import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

it('roams navigation rows with the arrow keys inside the rail', async () => {
  const user = userEvent.setup();
  render(
    <SidebarProvider defaultOpen>
      <Sidebar collapsible='icon'>
        <nav aria-label='Primary'>
          <Link href='/app'>Home</Link>
          <Link href='/app/library'>Library</Link>
          <Link href='/app/audience'>Audience</Link>
        </nav>
      </Sidebar>
    </SidebarProvider>
  );
  screen.getByRole('link', { name: 'Home' }).focus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('link', { name: 'Library' })).toHaveFocus();
  await user.keyboard('{End}');
  expect(screen.getByRole('link', { name: 'Audience' })).toHaveFocus();
  await user.keyboard('{ArrowUp}{Home}');
  expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus();
});
