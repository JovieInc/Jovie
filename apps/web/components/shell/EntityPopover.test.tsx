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
