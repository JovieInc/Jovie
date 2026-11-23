import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  SIDEBAR_O_PRESENCE_TEST_ID,
  SIDEBAR_O_STATUS_TEST_ID,
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
});
