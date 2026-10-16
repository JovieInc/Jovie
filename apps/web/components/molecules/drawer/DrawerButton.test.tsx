import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  checkPair,
  contrastRatio,
  defaultCssFiles,
  loadThemeTablesFromFiles,
  parseColor,
} from '../../../lib/a11y-gates/contrast-engine';
import { DrawerButton } from './DrawerButton';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function contrast(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) throw new Error(`unparseable ${foreground} on ${background}`);
  return contrastRatio(fg.luminance, bg.luminance);
}

describe('DrawerButton', () => {
  it('supports keyboard and pointer activation while preserving disabled semantics', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { rerender } = render(
      <>
        <DrawerButton onClick={onClick}>Save changes</DrawerButton>
        <DrawerButton disabled>Saving changes</DrawerButton>
      </>
    );

    const save = screen.getByRole('button', { name: 'Save changes' });
    const saving = screen.getByRole('button', { name: 'Saving changes' });
    expect(saving).toBeDisabled();

    await user.tab();
    expect(save).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();

    await user.click(save);
    expect(onClick).toHaveBeenCalledTimes(2);
    await user.click(saving);
    expect(onClick).toHaveBeenCalledTimes(2);

    rerender(
      <DrawerButton size='icon' aria-label='Open settings'>
        Settings
      </DrawerButton>
    );
    expect(
      screen.getByRole('button', { name: 'Open settings' })
    ).toBeInTheDocument();
  });

  it('paints idle Refresh secondary text above AA on the hud shell', () => {
    render(<DrawerButton tone='secondary'>Refresh</DrawerButton>);
    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'sm');
    expect(button.className).toContain('text-secondary-token');
    expect(button.className).toContain('bg-surface-0');

    const transition = button.className.match(/transition-\[([^\]]+)\]/);
    expect(transition?.[1].split(',')).toEqual([
      'background-color',
      'border-color',
    ]);

    const shell = '#07080a';
    // Axe reported 3.13 for this ink; the engine measures 3.138.
    const sampledFailure = contrast('#555f77', shell);
    expect(sampledFailure).toBeCloseTo(3.138, 2);
    expect(sampledFailure).toBeLessThan(4.5);

    const tables = loadThemeTablesFromFiles(defaultCssFiles(WEB_ROOT));
    const idle = checkPair(
      {
        name: 'hud refresh secondary',
        fg: '--color-text-secondary-token',
        bg: '--color-bg-surface-0',
        minRatio: 4.5,
      },
      tables.dark
    );
    expect(idle.status).toBe('pass');
    expect(idle.ratio).toBeGreaterThanOrEqual(4.5);
    expect(idle.ratio).toBeGreaterThan(sampledFailure);
  });
});
