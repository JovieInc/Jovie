import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-alt={alt} data-src={src} />
  ),
}));

import { COMMAND_PALETTE_COPY } from '@/data/commandPaletteCopy';
import { CommandPaletteLanding } from './CommandPaletteLanding';

describe('CommandPaletteLanding', () => {
  it('renders the live command palette in the hero', async () => {
    const user = userEvent.setup();
    render(<CommandPaletteLanding />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(hero).toHaveAttribute(
      'data-marketing-variant',
      'split-screenshot-right'
    );
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/app/(marketing)/product/command-palette/CommandPaletteLanding.tsx'
    );
    expect(hero).toHaveAttribute('data-accent', 'ion');

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(COMMAND_PALETTE_COPY.headline);
    expect(heading).toHaveAttribute('data-wrap', 'editorial-title');
    expect(heading).toHaveClass('text-balance');
    expect(heading.className).not.toMatch(/line-clamp/);
    expect(screen.getByText(COMMAND_PALETTE_COPY.support)).toBeVisible();

    const palette = screen.getByTestId('shared-command-palette');
    expect(palette).toBeVisible();
    const panel = screen.getByTestId('command-palette-panel');
    expect(panel).toHaveClass(
      'rounded-3xl',
      'border',
      'border-subtle',
      'bg-surface-1'
    );
    expect(panel).toContainElement(palette);

    await user.type(
      screen.getByRole('combobox', { name: 'Command Palette Search' }),
      'pitch'
    );
    await user.click(screen.getByRole('option', { name: /^Generate pitch/ }));
    expect(palette).toHaveAttribute(
      'data-committed-command',
      'generateReleasePitch'
    );

    for (const link of COMMAND_PALETTE_COPY.links) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href
      );
    }
  });
});
