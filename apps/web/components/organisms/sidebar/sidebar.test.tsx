import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import postcss from 'postcss';
import { beforeEach, expect, it, vi } from 'vitest';
import { SidebarProvider } from './context';
import { Sidebar } from './sidebar';

const runtime = vi.hoisted(() => ({ native: false }));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => runtime.native,
}));

beforeEach(() => {
  runtime.native = false;
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

it('removes the native collapsed icon rail from keyboard and assistive navigation', () => {
  runtime.native = true;
  render(
    <SidebarProvider defaultOpen={false}>
      <Sidebar collapsible='icon'>
        <Link href='/app'>Home</Link>
      </Sidebar>
    </SidebarProvider>
  );
  const rail = screen.getByText('Home').closest('#shell-left-rail');
  expect(rail).toHaveAttribute('aria-hidden', 'true');
  expect(rail).toHaveAttribute('inert');
});

it('keeps closed dropdown triggers visible inside an expanded native sidebar', () => {
  document.documentElement.dataset.desktopRuntime = 'electron';
  const { container } = render(
    <div data-app-shell-sidebar-mount='true'>
      <div id='shell-left-rail' data-state='open'>
        <button type='button' data-state='closed'>
          Workspace
        </button>
      </div>
    </div>
  );
  const trigger = screen.getByRole('button', { name: 'Workspace' });
  const css = postcss.parse(
    readFileSync(resolve(__dirname, '../../../app/globals.css'), 'utf8')
  );
  css.walkRules(rule => {
    if (
      (rule.selector.includes('shell-left-rail') ||
        rule.selector.includes('data-app-shell-sidebar-mount')) &&
      trigger.matches(rule.selector)
    )
      rule.walkDecls('visibility', declaration => {
        expect(declaration.value).not.toBe('hidden');
      });
  });
  expect(container.querySelector('#shell-left-rail')).toHaveAttribute(
    'data-state',
    'open'
  );
  document.documentElement.removeAttribute('data-desktop-runtime');
});
