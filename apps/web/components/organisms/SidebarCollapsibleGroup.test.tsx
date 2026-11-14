import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Music } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarCollapsibleGroup } from './SidebarCollapsibleGroup';

const STORAGE_KEY = 'jovie:sidebar-section:playlists';

function Group(props: Partial<ComponentProps<typeof SidebarCollapsibleGroup>>) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <SidebarCollapsibleGroup label='Playlists' {...props}>
          {props.children ?? <Link href='/app/playlists/1'>Summer Mix</Link>}
        </SidebarCollapsibleGroup>
      </SidebarProvider>
    </TooltipProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SidebarCollapsibleGroup', () => {
  it('collapses and expands its rows from the header button', async () => {
    const user = userEvent.setup();
    const { container } = render(<Group icon={Music} />);
    const toggle = screen.getByRole('button', { name: 'Playlists' });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Summer Mix' })).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed rows stay mounted but leave keyboard and assistive navigation.
    expect(screen.getByText('Summer Mix').closest('[inert]')).not.toBeNull();
    await expectNoA11yViolations(container);

    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('remembers the open state under its storage key', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Group storageKey='playlists' />);

    await user.click(screen.getByRole('button', { name: 'Playlists' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('closed');
    unmount();

    render(<Group storageKey='playlists' />);
    expect(screen.getByRole('button', { name: 'Playlists' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('falls back to its default when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const user = userEvent.setup();
    const { container } = render(
      <Group storageKey='playlists' defaultOpen={false} />
    );
    const toggle = screen.getByRole('button', { name: 'Playlists' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expectNoA11yViolations(container);
  });

  it.each([
    ['an empty section', { children: <p>No playlists yet</p> }],
    [
      'a long label',
      {
        label:
          'Playlists for The Extraordinarily Long Album Title (Deluxe Anniversary Remastered Edition)',
      },
    ],
  ])('has no axe violations with %s', async (_label, props) => {
    const { container } = render(<Group {...props} />);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left rail', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Group label='قوائم التشغيل'>
          <Link href='/app/playlists/1'>مزيج الصيف</Link>
        </Group>
      </div>
    );
    expect(screen.getByRole('button', { name: 'قوائم التشغيل' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
