/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopUpdateControlState } from '@/lib/desktop/desktop-update-control-state';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  DESKTOP_UPDATE_CONTROL_VISIBLE_KINDS,
  DesktopUpdateControl,
  describeDesktopUpdateControl,
} from './DesktopUpdateControl';

const VERSION = '26.11.12';
const STATES: Record<
  (typeof DESKTOP_UPDATE_CONTROL_VISIBLE_KINDS)[number],
  DesktopUpdateControlState
> = {
  checking: { kind: 'checking' },
  available: { kind: 'available', version: VERSION },
  downloading: { kind: 'downloading', version: VERSION, percent: 41.6 },
  ready: { kind: 'ready', version: VERSION },
  restarting: { kind: 'restarting', version: VERSION },
  failed: { kind: 'failed', retry: 'check', version: VERSION },
  offline: { kind: 'offline' },
};
const FAILED_RESTART: DesktopUpdateControlState = {
  kind: 'failed',
  retry: 'restart',
  version: VERSION,
};

/** The visible status line (the sr-only announcement can repeat its text). */
function statusLine(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-part="status"]');
  if (!node) throw new Error('Missing status line');
  return node;
}

function setup(state: DesktopUpdateControlState) {
  const handlers = {
    onDownload: vi.fn(),
    onRestart: vi.fn(),
    onRetry: vi.fn(),
  };
  const view = render(<DesktopUpdateControl state={state} {...handlers} />);
  return { ...view, handlers };
}

describe('DesktopUpdateControl', () => {
  it('renders nothing when hidden', () => {
    const { container } = setup({ kind: 'hidden' });
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['checking', 'Checking…', 'Retry update', true],
    ['available', 'Update Available', 'Download update', false],
    ['downloading', 'Downloading 42%', 'Download update', true],
    ['ready', 'Update Ready', 'Restart to update', false],
    ['restarting', 'Restarting…', 'Restart to update', true],
    ['failed', 'Update Failed', 'Retry update', false],
    ['offline', 'No Connection', 'Retry update', false],
  ] as const)(
    'shows %s as "%s" with the "%s" action',
    (kind, label, action, busy) => {
      setup(STATES[kind]);
      expect(screen.getByTestId('desktop-update-control')).toHaveAttribute(
        'data-state',
        kind
      );
      expect(statusLine()).toHaveTextContent(label);
      const button = screen.getByRole('button', { name: action });
      if (busy) {
        expect(button).toHaveAttribute('aria-busy', 'true');
        expect(button).toHaveAttribute('aria-disabled', 'true');
      } else {
        expect(button).not.toHaveAttribute('aria-busy', 'true');
        expect(button).not.toHaveAttribute('aria-disabled', 'true');
      }
    }
  );

  it('names a failed restart', () => {
    setup(FAILED_RESTART);
    expect(statusLine()).toHaveTextContent('Restart Failed');
    expect(screen.getByRole('button', { name: 'Retry update' })).toBeVisible();
  });

  it('routes each actionable state to its own handler', () => {
    const cases = [
      ['available', 'Download update', 'onDownload'],
      ['ready', 'Restart to update', 'onRestart'],
      ['failed', 'Retry update', 'onRetry'],
      ['offline', 'Retry update', 'onRetry'],
    ] as const;
    for (const [kind, name, handler] of cases) {
      const { handlers, unmount } = setup(STATES[kind]);
      fireEvent.click(screen.getByRole('button', { name }));
      expect(handlers[handler]).toHaveBeenCalledTimes(1);
      for (const [key, fn] of Object.entries(handlers)) {
        if (key !== handler) expect(fn).not.toHaveBeenCalled();
      }
      unmount();
    }
  });

  it('ignores presses while the updater is working', () => {
    for (const kind of ['checking', 'downloading', 'restarting'] as const) {
      const { handlers, unmount } = setup(STATES[kind]);
      fireEvent.click(screen.getByRole('button'));
      for (const fn of Object.values(handlers)) {
        expect(fn).not.toHaveBeenCalled();
      }
      unmount();
    }
  });

  it('reports determinate download progress', () => {
    setup(STATES.downloading);
    const bar = screen.getByRole('progressbar', { name: 'Download Progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '41.6');
    expect(bar).toHaveAttribute('aria-valuetext', '42%');
  });

  it('shows the progress bar only while downloading', () => {
    for (const kind of DESKTOP_UPDATE_CONTROL_VISIBLE_KINDS) {
      const { unmount } = setup(STATES[kind]);
      expect(screen.queryAllByRole('progressbar')).toHaveLength(
        kind === 'downloading' ? 1 : 0
      );
      unmount();
    }
  });

  it('announces the state without the percent', () => {
    const { rerender, handlers } = setup(STATES.downloading);
    const status = () =>
      screen
        .getAllByRole('status')
        .map(node => node.textContent)
        .filter(Boolean);
    expect(status()).toEqual(['Downloading update']);
    rerender(<DesktopUpdateControl state={STATES.ready} {...handlers} />);
    expect(status()).toEqual(['Update ready, restart to update']);
  });

  it('keeps one button and one footprint through every transition', () => {
    const { rerender, handlers } = setup(STATES.checking);
    const root = screen.getByTestId('desktop-update-control');
    const button = screen.getByRole('button');
    const rootClass = root.className;
    const buttonWidth = /\bw-\d+\b/.exec(button.className)?.[0];
    expect(buttonWidth).toBeTruthy();
    button.focus();

    for (const state of [
      STATES.available,
      STATES.downloading,
      { ...STATES.downloading, percent: 99 } as DesktopUpdateControlState,
      STATES.ready,
      STATES.restarting,
      FAILED_RESTART,
      STATES.failed,
      STATES.offline,
      STATES.checking,
    ]) {
      rerender(<DesktopUpdateControl state={state} {...handlers} />);
      // Same nodes, same layout classes: nothing remounts or resizes.
      expect(screen.getByTestId('desktop-update-control')).toBe(root);
      expect(root.className).toBe(rootClass);
      expect(screen.getByRole('button')).toBe(button);
      expect(button.className).toContain(buttonWidth);
      expect(button).toHaveFocus();
    }
    expect(rootClass).toMatch(/\bh-9\b/);
    expect(rootClass).toMatch(/\bw-full\b/);
  });

  it('updates the percent in place without replaying the state fade', () => {
    const { rerender, handlers } = setup(STATES.downloading);
    const status = statusLine();
    expect(status).toHaveTextContent('Downloading 42%');
    rerender(
      <DesktopUpdateControl
        state={{ kind: 'downloading', version: VERSION, percent: 77 }}
        {...handlers}
      />
    );
    expect(statusLine()).toBe(status);
    expect(status).toHaveTextContent('Downloading 77%');
    rerender(<DesktopUpdateControl state={STATES.ready} {...handlers} />);
    expect(statusLine()).not.toBe(status);
    expect(statusLine()).toHaveTextContent('Update Ready');
  });

  it('animates with design-system motion tokens only', () => {
    const { container } = setup(STATES.downloading);
    const animated = [
      ...container.querySelectorAll('[class*="transition"]'),
    ].map(node => node.getAttribute('class') ?? '');
    expect(animated.length).toBeGreaterThan(0);
    for (const classes of animated) {
      expect(classes).not.toMatch(/\bduration-\d|\bease-\[|transition-all/);
      expect(classes).toMatch(/motion-reduce:transition-none/);
    }
  });

  it('has no accessibility violations in any state', async () => {
    for (const kind of DESKTOP_UPDATE_CONTROL_VISIBLE_KINDS) {
      const { container, unmount } = setup(STATES[kind]);
      await expectNoA11yViolations(container);
      unmount();
    }
  });
});

describe('describeDesktopUpdateControl', () => {
  it('writes status fragments without a closing full stop', () => {
    for (const state of [...Object.values(STATES), FAILED_RESTART]) {
      const view = describeDesktopUpdateControl(state);
      expect(view).not.toBeNull();
      for (const text of [
        view?.label,
        view?.announcement,
        view?.actionLabel,
        view?.actionAriaLabel,
      ]) {
        expect(text).toBeTruthy();
        expect(text).not.toMatch(/\.$/);
        expect(text).toMatch(/^[A-Z]/);
      }
    }
  });

  it('makes only the restart primary', () => {
    for (const kind of DESKTOP_UPDATE_CONTROL_VISIBLE_KINDS) {
      expect(describeDesktopUpdateControl(STATES[kind])?.primary).toBe(
        kind === 'ready' || kind === 'restarting'
      );
    }
  });
});
