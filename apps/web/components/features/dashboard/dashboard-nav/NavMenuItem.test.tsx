import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { Music, SquarePen } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { chatNavItem } from './config';
import { NavMenuItem } from './NavMenuItem';

vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => false,
}));

function readWebSource(sourcePath: string): string {
  const webRoot = process.cwd().endsWith('/apps/web')
    ? process.cwd()
    : resolve(process.cwd(), 'apps/web');
  return readFileSync(resolve(webRoot, sourcePath), 'utf8');
}

describe('NavMenuItem', () => {
  it('keeps a long primary label in its assigned grid track with a right-edge fade', () => {
    const name =
      'A deliberately long primary destination that must fade instead of overflowing';

    render(
      <NavMenuItem
        item={{
          id: 'library',
          name,
          href: '/app/library',
          icon: Music,
        }}
        isActive={false}
      />
    );

    const label = screen.getByText(name);
    expect(label.className).toContain('w-full');
    expect(label.className).toContain('justify-self-stretch');
    expect(label.className).toContain('overflow-hidden');
    expect(label.className).toContain('mask-image:linear-gradient');
    expect(label.className).not.toContain('justify-self-start');
  });

  // JOV-6181 (desktop rail companion): the compact New Chat create row is
  // w-fit with an auto-sized label track, so its span hugs the text — the
  // full-track terminal fade would shear the trailing glyph ("Chat" -> "Cha")
  // with rail space free. Primary/secondary create tones keep the raw clip.
  it('keeps the New Chat primary rail label off the terminal fade', () => {
    render(
      <NavMenuItem
        item={{
          id: 'chat',
          name: 'New Chat',
          href: '/app/chat',
          icon: SquarePen,
          tone: 'primary',
        }}
        isActive={false}
      />
    );

    const label = screen.getByText('New Chat');
    expect(label.className).toContain('w-full');
    expect(label.className).toContain('justify-self-stretch');
    expect(label.className).toContain('overflow-hidden');
    expect(label.className).not.toContain('mask-image');
  });

  // JOV-6181: same assertion, but through the real shipped config object so a
  // config regression (tone dropped, renamed label) cannot silently re-expose
  // the fade on the row the production rail hands to NavMenuItem.
  it('keeps the configured chatNavItem label unmasked', () => {
    expect(chatNavItem.name).toBe('New Chat');
    expect(chatNavItem.tone).toBe('primary');

    render(<NavMenuItem item={chatNavItem} isActive={false} />);

    const label = screen.getByText('New Chat');
    expect(label.className).not.toContain('mask-image');
  });

  it('forwards calm rail geometry to the shared shell chrome', () => {
    render(
      <NavMenuItem
        calm
        item={{
          id: 'library',
          name: 'Library',
          href: '/app/library',
          icon: Music,
        }}
        isActive
      />
    );

    const row = screen.getByRole('link', { name: 'Library' });
    // Founder lock 2026-09-25 (Linear-scale density): calm rows are 28px
    // (h-7), down from the prior 36px (h-9).
    expect(row.className).toContain('h-7');
    expect(row.className).toContain('rounded-lg');
    expect(row.className).toContain('grid-cols-(--app-shell-sidebar-nav-grid)');
  });

  it('acknowledges a pending destination without changing row geometry', () => {
    render(
      <NavMenuItem
        calm
        item={{
          id: 'library',
          name: 'Library',
          href: '/app/library',
          icon: Music,
        }}
        isActive={false}
        pending
      />
    );

    const row = screen.getByRole('link', { name: 'Library' });
    expect(row).toHaveAttribute('aria-busy', 'true');
    expect(row).toHaveAttribute('data-navigation-item-id', 'library');
    expect(row).toHaveAttribute('data-navigation-pending', 'true');
    expect(row.className).toContain('bg-sidebar-accent-active');
    expect(row.className).toContain('h-7');
    expect(row.className).toContain('grid-cols-(--app-shell-sidebar-nav-grid)');
  });

  it('stages the label exit out of the collapsed grid flow (JOV-4522)', () => {
    render(
      <NavMenuItem
        item={{
          id: 'library',
          name: 'Library',
          href: '/app/library',
          icon: Music,
        }}
        isActive={false}
      />
    );

    const label = screen.getByText('Library');
    // Absolute positioning in the collapsed rail lifts the label out of the
    // single-column grid so it fades/drifts instead of wrapping a phantom row
    // or snapping to display:none.
    expect(label.className).toContain('group-data-[collapsible=icon]:absolute');
    expect(label.className).toContain(
      'group-data-[collapsible=icon]:opacity-0'
    );
    expect(label.className).toContain('duration-shell-rail');
    expect(label.className).not.toContain(
      'group-data-[collapsible=icon]:hidden'
    );
  });

  it('imports sidebar chrome from the modular sidebar specifier', () => {
    const source = readWebSource(
      'components/features/dashboard/dashboard-nav/NavMenuItem.tsx'
    );
    expect(source).toContain("@/components/organisms/sidebar'");
    expect(source).not.toContain(`@/components/organisms/${'Sidebar'}'`);
  });
});
