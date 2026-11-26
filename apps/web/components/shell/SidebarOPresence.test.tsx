import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  SIDEBAR_O_PRESENCE_TEST_ID,
  SIDEBAR_O_STATUS_TEST_ID,
  SIDEBAR_O_SYNCED_HOLD_MS,
  SIDEBAR_O_UPDATE_MIN_MS,
  SIDEBAR_O_UPDATE_REVEAL_MS,
  SIDEBAR_O_UPDATING_DELAY_MS,
  SIDEBAR_O_UPDATING_MIN_MS,
  SidebarOPresence,
} from './SidebarOPresence';

vi.mock('next/link', () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<'a'> & { prefetch?: boolean }) => <a {...props} />,
}));

afterEach(() => {
  vi.useRealTimers();
});

const layoutClasses = (el: HTMLElement) =>
  el.className
    .split(' ')
    .filter(c => !/^(opacity-|translate-|-translate-|motion-reduce:)/.test(c))
    .join(' ');

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

const player = {
  title: 'Never Say A Word',
  artist: 'Tim White',
  isPlaying: true,
  onToggle: vi.fn(),
  onExpand: vi.fn(),
};

describe('SidebarOPresence as the mini player', () => {
  it('is play/pause with the track title beside it, in the compact audio surface', () => {
    const { rerender } = render(<SidebarOPresence player={player} />);
    const pause = screen.getByRole('button', {
      name: 'Pause Never Say A Word',
    });
    fireEvent.click(pause);
    expect(player.onToggle).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link', { name: 'Open Chat' })).toBeNull();
    const surface = screen.getByTestId(SIDEBAR_O_PRESENCE_TEST_ID);
    expect(surface).toHaveAttribute(
      'data-shell-audio-surface',
      'sidebar-compact'
    );
    expect(surface).toHaveAttribute('data-state', 'visible');
    const expand = screen.getByRole('button', { name: /Show Player/ });
    expect(expand).toHaveAttribute('data-audio-expand-player', 'true');
    expect(expand).toHaveTextContent('Never Say A Word · Tim White');
    fireEvent.click(expand);
    expect(player.onExpand).toHaveBeenCalledOnce();
    rerender(<SidebarOPresence player={{ ...player, isPlaying: false }} />);
    expect(
      screen.getByRole('button', { name: 'Play Never Say A Word' })
    ).toBeVisible();
  });

  it('draws one glyph and keeps the row and slot boxes the same as idle', () => {
    const idle = render(<SidebarOPresence />);
    const idleRow = layoutClasses(
      screen.getByTestId(SIDEBAR_O_PRESENCE_TEST_ID)
    );
    const idleButton = layoutClasses(screen.getByRole('link'));
    idle.unmount();
    const { container } = render(<SidebarOPresence player={player} />);
    expect(layoutClasses(screen.getByTestId(SIDEBAR_O_PRESENCE_TEST_ID))).toBe(
      idleRow
    );
    // Idle O is a 28px link (size-7); the player O is Button icon-sm, which
    // is the same 28px box, so the slot does not move when play starts.
    expect(idleButton.split(' ')).toContain('size-7');
    const playerButton = screen
      .getByRole('button', { name: /^Pause/ })
      .className.split(' ');
    expect(playerButton).toEqual(expect.arrayContaining(['h-7', 'w-7']));
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('shows just the title when the track has no artist', () => {
    render(<SidebarOPresence player={{ ...player, artist: null }} />);
    expect(
      screen.getByRole('button', { name: /Show Player/ })
    ).toHaveTextContent(/^Never Say A WordShow Player$/);
  });

  it('is present but inert and hidden while the full player is the transport', () => {
    render(<SidebarOPresence player={player} inert />);
    const surface = screen.getByTestId(SIDEBAR_O_PRESENCE_TEST_ID);
    expect(surface).toHaveAttribute('inert');
    expect(surface).toHaveAttribute('aria-hidden', 'true');
    expect(surface).toHaveAttribute('data-state', 'reserved');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fades a new title in on the subtle token and drops it under reduced motion', () => {
    const css = readFileSync(join(__dirname, 'SidebarOPresence.css'), 'utf8');
    expect(css).toMatch(
      /animation:\s*sidebar-o-title-in var\(--duration-subtle\)/
    );
    expect(css).not.toMatch(/\d\s?ms\b/);
    const keyframes =
      css.match(/@keyframes sidebar-o-title-in\s*\{[^@]*?\}\s*\}/s)?.[0] ?? '';
    expect(keyframes).toMatch(/opacity/);
    expect(keyframes).not.toMatch(/width|height|margin|padding|top|left/);
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{[^}]*\.sidebar-o-title\s*\{\s*animation: none/s
    );
  });

  it('has no axe violations as the mini player', async () => {
    const { container } = render(<SidebarOPresence player={player} />);
    await expectNoA11yViolations(container);
  });
});

describe('SidebarOPresence', () => {
  it('links the O to the main chat page without opening a panel', () => {
    render(<SidebarOPresence />);
    const link = screen.getByRole('link', { name: 'Open Chat' });
    expect(link).toHaveAttribute('href', '/app/chat');
    expect(link).not.toHaveAttribute('aria-haspopup');
  });

  it('hides the glyph from assistive tech so the link name is the label', () => {
    render(<SidebarOPresence />);
    const link = screen.getByRole('link', { name: 'Open Chat' });
    const glyph = link.querySelector('[data-brand-variant]');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(link.querySelector('title')).toBeNull();
  });

  it('moves by opacity and transform on the slow motion token, never a raw duration', () => {
    const css = readFileSync(join(__dirname, 'SidebarOPresence.css'), 'utf8');
    expect(css).toMatch(/transition:\s*opacity var\(--duration-slow\)/);
    expect(css).toMatch(/transform var\(--duration-slow\)/);
    expect(css).not.toMatch(/\d\s?ms\b/);
    expect(css).not.toMatch(
      /transition[^;]*\b(?:width|height|margin|padding|all)\b/
    );
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    render(<SidebarOPresence />);
    expect(screen.getByTestId(SIDEBAR_O_STATUS_TEST_ID)).toHaveClass(
      'sidebar-o-status'
    );
  });

  it('shows the update status only after the delay, then hides it after the minimum', () => {
    vi.useFakeTimers();
    const { rerender } = render(<SidebarOPresence />);
    const status = screen.getByTestId(SIDEBAR_O_STATUS_TEST_ID);
    expect(status).toHaveAttribute('data-state', 'hidden');

    rerender(<SidebarOPresence updating />);
    advance(SIDEBAR_O_UPDATING_DELAY_MS - 1);
    expect(status).toHaveAttribute('data-state', 'hidden');
    advance(1);
    expect(status).toHaveAttribute('data-state', 'visible');
    expect(screen.getByRole('status')).toHaveTextContent('Updating');

    advance(100);
    rerender(<SidebarOPresence />);
    expect(status).toHaveAttribute('data-state', 'visible');
    advance(SIDEBAR_O_UPDATING_MIN_MS - 100);
    expect(status).toHaveAttribute('data-state', 'hidden');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('never shows for a check that finishes before the delay', () => {
    vi.useFakeTimers();
    const { rerender } = render(<SidebarOPresence updating />);
    advance(SIDEBAR_O_UPDATING_DELAY_MS - 50);
    rerender(<SidebarOPresence />);
    advance(SIDEBAR_O_UPDATING_MIN_MS * 2);
    expect(screen.getByTestId(SIDEBAR_O_STATUS_TEST_ID)).toHaveAttribute(
      'data-state',
      'hidden'
    );
  });

  it('keeps the status slot box identical hidden and shown so nothing shifts', () => {
    vi.useFakeTimers();
    const { rerender } = render(<SidebarOPresence />);
    const status = screen.getByTestId(SIDEBAR_O_STATUS_TEST_ID);
    const hidden = layoutClasses(status);
    const hiddenChildren = status.childElementCount;
    rerender(<SidebarOPresence updating />);
    advance(SIDEBAR_O_UPDATING_DELAY_MS);
    expect(status).toHaveAttribute('data-state', 'visible');
    expect(layoutClasses(status)).toBe(hidden);
    expect(status.childElementCount).toBe(hiddenChildren);
    expect(status).toHaveClass('flex-1', 'h-4');
    expect(status.classList.contains('hidden')).toBe(false);
    expect(status.classList.contains('w-0')).toBe(false);
    // The painted label is identical in both states; only opacity moves.
    expect(status).toHaveTextContent('Updating');
  });

  it('draws exactly one O glyph', () => {
    const { container } = render(<SidebarOPresence variant='ov' />);
    expect(container.querySelectorAll('[data-brand-variant]')).toHaveLength(1);
    expect(screen.getByTestId(SIDEBAR_O_PRESENCE_TEST_ID)).toHaveAttribute(
      'data-sidebar-o-presence'
    );
  });

  it('has no axe violations idle or updating', async () => {
    const { container, rerender } = render(<SidebarOPresence />);
    await expectNoA11yViolations(container);
    rerender(<SidebarOPresence updating />);
    await expectNoA11yViolations(container);
  });

  describe('real update link', () => {
    const update = {
      id: 1,
      label: '3 releases shipped',
      href: '/app/ov/shipping',
    };
    const link = () =>
      screen
        .getByTestId(SIDEBAR_O_STATUS_TEST_ID)
        .querySelector('[data-sidebar-o-update]') as HTMLElement;

    it('shows nothing for a null update', () => {
      render(<SidebarOPresence update={null} />);
      expect(screen.getByTestId(SIDEBAR_O_STATUS_TEST_ID)).toHaveAttribute(
        'data-state',
        'hidden'
      );
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('reveals after 400 ms, holds 2400 ms, then fades and reports done', () => {
      vi.useFakeTimers();
      const onDone = vi.fn();
      render(<SidebarOPresence update={update} onUpdateDone={onDone} />);
      const status = screen.getByTestId(SIDEBAR_O_STATUS_TEST_ID);
      advance(SIDEBAR_O_UPDATE_REVEAL_MS - 1);
      expect(status).toHaveAttribute('data-state', 'hidden');
      advance(1);
      expect(status).toHaveAttribute('data-state', 'visible');
      expect(link()).toHaveAttribute('href', '/app/ov/shipping');
      expect(link()).toHaveTextContent('3 releases shipped');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Updated: 3 releases shipped'
      );
      advance(SIDEBAR_O_SYNCED_HOLD_MS - 1);
      expect(status).toHaveAttribute('data-state', 'visible');
      expect(onDone).not.toHaveBeenCalled();
      advance(1);
      expect(status).toHaveAttribute('data-state', 'hidden');
      expect(onDone).toHaveBeenCalledTimes(1);
      // The text stays painted through the fade so the slot never reflows.
      expect(status).toHaveTextContent('3 releases shipped');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('keeps a newer update waiting until the minimum, then restarts the hold', () => {
      vi.useFakeTimers();
      const { rerender } = render(<SidebarOPresence update={update} />);
      advance(SIDEBAR_O_UPDATE_REVEAL_MS);
      advance(100);
      rerender(
        <SidebarOPresence
          update={{ id: 2, label: '2 tasks moved', href: '/app/ov/shipping' }}
        />
      );
      expect(link()).toHaveTextContent('3 releases shipped');
      advance(SIDEBAR_O_UPDATE_MIN_MS - 100);
      expect(link()).toHaveTextContent('2 tasks moved');
      advance(SIDEBAR_O_SYNCED_HOLD_MS - 1);
      expect(screen.getByTestId(SIDEBAR_O_STATUS_TEST_ID)).toHaveAttribute(
        'data-state',
        'visible'
      );
    });

    it('takes the link out of the tab order and the tree while hidden', () => {
      render(<SidebarOPresence update={null} />);
      const hidden = screen
        .getByTestId(SIDEBAR_O_STATUS_TEST_ID)
        .querySelector('[data-sidebar-o-update]');
      expect(hidden).toHaveAttribute('tabindex', '-1');
      expect(hidden).toHaveAttribute('aria-hidden', 'true');
    });

    it('keeps the slot box identical hidden and shown with an update', () => {
      vi.useFakeTimers();
      const { rerender } = render(<SidebarOPresence />);
      const status = screen.getByTestId(SIDEBAR_O_STATUS_TEST_ID);
      const hidden = layoutClasses(status);
      const children = status.childElementCount;
      rerender(<SidebarOPresence update={update} />);
      advance(SIDEBAR_O_UPDATE_REVEAL_MS);
      expect(status).toHaveAttribute('data-state', 'visible');
      expect(layoutClasses(status)).toBe(hidden);
      expect(status.childElementCount).toBe(children);
      expect(status.classList.contains('hidden')).toBe(false);
      expect(status).toHaveClass('flex-1', 'h-4');
    });

    it('moves by opacity and transform only: fade out on the normal token', () => {
      const css = readFileSync(join(__dirname, 'SidebarOPresence.css'), 'utf8');
      expect(css).toMatch(
        /opacity var\(--duration-normal\) var\(--ease-subtle\)/
      );
      expect(css).toMatch(/opacity var\(--duration-slow\) var\(--ease-out\)/);
      expect(css).not.toMatch(/\d\s?ms\b/);
    });

    it('under reduced motion drops the travel and transitions, same end state', () => {
      const css = readFileSync(join(__dirname, 'SidebarOPresence.css'), 'utf8');
      const reduced = css.slice(css.indexOf('prefers-reduced-motion: reduce'));
      expect(reduced).toMatch(/transform:\s*none/);
      expect(reduced).toMatch(/transition:\s*none/);
      // The state machine is not motion-dependent: it ends visible then hidden.
      vi.useFakeTimers();
      render(<SidebarOPresence update={update} />);
      advance(SIDEBAR_O_UPDATE_REVEAL_MS);
      expect(screen.getByTestId(SIDEBAR_O_STATUS_TEST_ID)).toHaveAttribute(
        'data-state',
        'visible'
      );
    });

    it('prefers the desktop updating status while it is showing', () => {
      vi.useFakeTimers();
      render(<SidebarOPresence updating update={update} />);
      advance(SIDEBAR_O_UPDATE_REVEAL_MS);
      expect(screen.getByRole('status')).toHaveTextContent('Updating');
      expect(
        screen
          .getByTestId(SIDEBAR_O_STATUS_TEST_ID)
          .querySelector('[data-sidebar-o-update]')
      ).toHaveAttribute('aria-hidden', 'true');
    });

    it('has no axe violations while an update shows', async () => {
      vi.useFakeTimers();
      const { container } = render(<SidebarOPresence update={update} />);
      advance(SIDEBAR_O_UPDATE_REVEAL_MS);
      vi.useRealTimers();
      await expectNoA11yViolations(container);
    });
  });
});
