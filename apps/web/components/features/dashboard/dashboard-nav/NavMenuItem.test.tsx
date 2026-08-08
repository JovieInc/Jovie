import { render, screen } from '@testing-library/react';
import { Music } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { NavMenuItem } from './NavMenuItem';

vi.mock('@/lib/desktop/electron-bridge', () => ({
  useIsElectronRuntime: () => false,
}));

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
});
