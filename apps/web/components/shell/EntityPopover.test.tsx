import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { EntityHoverLink, type EntityPopoverData } from './EntityPopover';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: ComponentProps<'img'>) => (
    <img src={src as string} alt={alt ?? ''} {...rest} />
  ),
}));

const release = {
  kind: 'release',
  id: 'rel_1',
  label: 'Sober',
  artist: 'Jovie',
  releaseType: 'Single',
} satisfies EntityPopoverData;

afterEach(() => {
  vi.useRealTimers();
});

function advanceTimers(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('EntityHoverLink', () => {
  it('opens on hover and closes on mouse leave', () => {
    vi.useFakeTimers();
    fastRender(<EntityHoverLink entity={release}>Sober</EntityHoverLink>);
    const trigger = screen.getByRole('button', { name: 'Sober' });

    fireEvent.mouseEnter(trigger);
    advanceTimers(200);

    expect(screen.getByRole('tooltip').textContent).toContain('Sober');

    fireEvent.mouseLeave(trigger);
    advanceTimers(120);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('uses named shell tokens for the popover surface', () => {
    vi.useFakeTimers();
    fastRender(<EntityHoverLink entity={release}>Sober</EntityHoverLink>);
    const trigger = screen.getByRole('button', { name: 'Sober' });

    fireEvent.mouseEnter(trigger);
    advanceTimers(200);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveClass('rounded-xl', 'bg-surface-1', 'p-0');
    expect(tooltip.className).not.toContain('bg-(--linear-bg-surface-0)');
    expect(tooltip.className).not.toContain(
      'rounded-(--linear-app-radius-menu)'
    );
    // Padding cleanup: rail-aligned px-3 py-2.5 for premium compact popover
    expect(tooltip.firstElementChild).toHaveClass('px-3', 'py-2.5');
  });

  it('opens on focus and closes on Escape', () => {
    vi.useFakeTimers();
    fastRender(<EntityHoverLink entity={release}>Sober</EntityHoverLink>);
    const trigger = screen.getByRole('button', { name: 'Sober' });

    fireEvent.focus(trigger);
    advanceTimers(200);

    expect(screen.getByRole('tooltip').textContent).toContain('Sober');

    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('EntityPopover source contract', () => {
  it('keeps floating surface chrome on the shared token', () => {
    // Robust path: resolve relative to this test file (same dir as the source).
    // Prevents cwd-dependent breakage (package vs repo root invocation contexts).
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const source = readFileSync(
      resolve(__dirname, 'EntityPopover.tsx'),
      'utf8'
    );

    expect(source).toContain(
      "import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';"
    );
    expect(source).toContain('LINEAR_SURFACE.popover');
    expect(source).not.toContain("'rounded-lg border border-default'");
    expect(source).not.toContain("'bg-surface-0 text-primary-token");
  });
});
