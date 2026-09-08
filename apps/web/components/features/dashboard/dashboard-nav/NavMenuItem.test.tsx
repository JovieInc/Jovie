import { render, screen } from '@testing-library/react';
import { Music, SquarePen } from 'lucide-react';
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
});
