import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
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
