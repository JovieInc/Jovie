import { render, screen } from '@testing-library/react';
import { Music } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { NavMenuItem } from './NavMenuItem';

vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => false,
}));

describe('NavMenuItem', () => {
  it.each([
    true,
    false,
  ])('keeps the short New Chat label unmasked (active=%s)', isActive => {
    render(
      <NavMenuItem
        item={{
          id: 'chat',
          name: 'New Chat',
          href: '/app/chat',
          icon: Music,
          tone: 'primary',
        }}
        isActive={isActive}
      />
    );
    expect(screen.getByRole('link', { name: 'New Chat' })).toBeInTheDocument();
    expect(screen.getByText('New Chat').className).not.toContain('mask-image');
  });
  it('keeps a long primary label in its assigned grid track with overflow truncation', () => {
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
    expect(label.className).toContain('truncate');
    expect(label.className).not.toContain('mask-image');
    expect(label.className).not.toContain('justify-self-start');
  });
});
