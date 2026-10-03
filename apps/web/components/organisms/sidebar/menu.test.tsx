import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./context', () => ({
  useSidebar: () => ({
    state: 'open',
    open: true,
    setOpen: vi.fn(),
    openMobile: false,
    setOpenMobile: vi.fn(),
    isMobile: false,
    toggleSidebar: vi.fn(),
  }),
}));

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
} from './menu';

describe('sidebar menu', () => {
  it('renders menu rows inside a list', () => {
    render(
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton>Overview</SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
    expect(screen.getByText('Overview')).toBeTruthy();
  });

  it('marks the active button and keeps tokenized motion classes', () => {
    render(<SidebarMenuButton isActive>Library</SidebarMenuButton>);
    const button = screen.getByText('Library').closest('button');
    expect(button?.getAttribute('data-active')).toBe('true');
    const className = button?.className ?? '';
    expect(className).toContain('duration-fast');
    expect(className).toContain('ease-interactive');
  });

  it('renders a sub button with nav font weight', () => {
    render(<SidebarMenuSubButton href='/app'>Releases</SidebarMenuSubButton>);
    const link = screen.getByText('Releases').closest('a');
    expect(link?.className).toContain('duration-normal');
  });
});

describe('sidebar menu motion tokens (JOV-4873)', () => {
  it('uses intent motion tokens only — no raw numeric durations', () => {
    const source = readFileSync(path.join(__dirname, 'menu.tsx'), 'utf8');
    expect(source).not.toMatch(/\bduration-\d/);
    // Icon color snaps instantly: a 0ms transition is equivalent to no
    // transition, so no duration-0 escape hatch may come back.
    expect(source).not.toContain('duration-0');
  });
});

describe('sidebar menu rail-motion label exit (JOV-4522)', () => {
  it('stages the label span on max-width/opacity/travel instead of display:none', () => {
    render(
      <SidebarMenuButton>
        <span>Library</span>
      </SidebarMenuButton>
    );
    const className =
      screen.getByText('Library').closest('button')?.className ?? '';
    // The label stays mounted and collapses in lockstep with the rail
    // allocation; a `hidden` collapse popped it at frame one.
    expect(className).toContain(
      '[&>span:is(:last-child,[data-rail-label])]:transition-[max-width,opacity,transform]'
    );
    expect(className).toContain('duration-cinematic');
    expect(className).toContain(
      'group-data-[collapsible=icon]:[&>span:is(:last-child,[data-rail-label])]:max-w-0'
    );
    expect(className).not.toContain(
      'group-data-[collapsible=icon]:[&>span:last-child]:hidden'
    );
    // Non-label spans still leave the layout instantly.
    expect(className).toContain(
      'group-data-[collapsible=icon]:[&>span:not(.sr-only):not(:last-child):not([data-rail-label])]:hidden'
    );
  });
});
