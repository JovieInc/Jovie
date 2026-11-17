import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { beforeEach, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarProvider, useSidebar } from './context';
import { Sidebar } from './sidebar';

const breakpoint = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/useBreakpoint', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useBreakpoint')>()),
  useBreakpointDown: () => breakpoint.mobile,
}));

function MobileOpenFixture() {
  const { toggleSidebar } = useSidebar();
  return (
    <button type='button' onClick={toggleSidebar}>
      Open Drawer
    </button>
  );
}

beforeEach(() => {
  document.cookie = 'sidebar:state=; path=/; max-age=0';
  breakpoint.mobile = false;
});

it('opens the phone drawer without lighting up its first control', async () => {
  breakpoint.mobile = true;
  const user = userEvent.setup();
  render(
    <SidebarProvider>
      <MobileOpenFixture />
      <Sidebar collapsible='offcanvas'>
        <button type='button'>Switch Workspace</button>
        <Link href='/app'>Home</Link>
      </Sidebar>
    </SidebarProvider>
  );
  await user.click(screen.getByRole('button', { name: 'Open Drawer' }));
  const dialog = await screen.findByRole('dialog');
  // Radix would focus the brand switcher and paint its focus fill. The
  // drawer takes focus itself so the first row rests like every other.
  expect(dialog).toHaveFocus();
  expect(
    screen.getByRole('button', { name: 'Switch Workspace' })
  ).not.toHaveFocus();
  await user.keyboard('{Tab}');
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
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

it.each([
  ['pinned rail', true, 'icon'],
  ['compact icon rail', false, 'icon'],
  ['static rail', true, 'none'],
] as const)(
  'has no axe violations for the %s',
  async (_label, defaultOpen, collapsible) => {
    const { container } = render(
      <SidebarProvider defaultOpen={defaultOpen}>
        <Sidebar collapsible={collapsible}>
          <nav aria-label='Primary'>
            <Link href='/app'>Home</Link>
            <Link href='/app/library'>
              Release Planning for The Extraordinarily Long Album Title (Deluxe
              Anniversary Remastered Edition)
            </Link>
          </nav>
        </Sidebar>
      </SidebarProvider>
    );
    await expectNoA11yViolations(container);
  }
);

it('roams a right-to-left rail with the arrow keys without axe violations', async () => {
  const user = userEvent.setup();
  const { container } = render(
    <div dir='rtl' lang='ar'>
      <SidebarProvider defaultOpen>
        <Sidebar collapsible='icon' side='right'>
          <nav aria-label='التنقل الرئيسي'>
            <Link href='/app'>الرئيسية</Link>
            <Link href='/app/library'>المكتبة</Link>
          </nav>
        </Sidebar>
      </SidebarProvider>
    </div>
  );
  screen.getByRole('link', { name: 'الرئيسية' }).focus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('link', { name: 'المكتبة' })).toHaveFocus();
  await expectNoA11yViolations(container);
});
