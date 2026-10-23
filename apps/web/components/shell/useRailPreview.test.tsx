import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHELL_RAIL_PREVIEW_GRACE_MS } from './rail-motion';
import { useRailPreview } from './useRailPreview';

function Harness({
  side,
  resetKey = 'home',
  enabled = true,
  previewTrigger,
}: {
  side: 'left' | 'right';
  resetKey?: string;
  enabled?: boolean;
  previewTrigger?: boolean;
}) {
  const [pinned, setPinned] = useState(false);
  const { isPreview, isFloating, dismissPreview } = useRailPreview({
    side,
    pinned,
    enabled,
    resetKey,
  });
  return (
    <>
      <button
        type='button'
        data-testid='trigger'
        data-rail-toggle={side}
        data-rail-preview-trigger={previewTrigger}
        onClick={() => {
          dismissPreview();
          setPinned(v => !v);
        }}
      >
        Toggle
      </button>
      <div
        data-testid='rail'
        data-rail-preview-region={side}
        data-preview={isPreview}
        data-floating={isFloating}
        data-pinned={pinned}
      >
        <button type='button'>Rail action</button>
      </div>
      <button type='button' data-testid='outside'>
        Outside
      </button>
    </>
  );
}

afterEach(() => vi.useRealTimers());

describe.each(['left', 'right'] as const)(
  '%s shared transient rail owner',
  side => {
    it('keeps an in-content manual control reachable until explicit activation', () => {
      render(<Harness side={side} previewTrigger={false} />);
      const trigger = screen.getByTestId('trigger');
      const rail = screen.getByTestId('rail');
      fireEvent.pointerOver(trigger);
      expect(rail).toHaveAttribute('data-preview', 'false');
      act(() => trigger.focus());
      expect(rail).toHaveAttribute('data-preview', 'false');
      fireEvent.click(trigger);
      expect(rail).toHaveAttribute('data-pinned', 'true');
      expect(trigger).toHaveFocus();
    });

    it('bridges pointer travel, dismisses after grace and never changes pinned intent', () => {
      vi.useFakeTimers();
      render(<Harness side={side} />);
      const trigger = screen.getByTestId('trigger');
      const rail = screen.getByTestId('rail');
      fireEvent.pointerOver(trigger);
      expect(rail).toHaveAttribute('data-preview', 'true');
      expect(trigger).not.toHaveFocus();
      fireEvent.pointerOut(trigger);
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS - 1));
      expect(rail).toHaveAttribute('data-preview', 'true');
      fireEvent.pointerOver(rail);
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS * 2));
      expect(rail).toHaveAttribute('data-preview', 'true');
      fireEvent.pointerOut(rail);
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS));
      expect(rail).toHaveAttribute('data-preview', 'false');
      expect(rail).toHaveAttribute('data-pinned', 'false');
    });

    it('retains an open ARIA-owned menu across pointer travel and releases after removal', async () => {
      vi.useFakeTimers();
      render(<Harness side={side} />);
      const rail = screen.getByTestId('rail');
      const control = screen.getByRole('button', { name: 'Rail action' });
      control.setAttribute('aria-expanded', 'true');
      control.setAttribute('aria-controls', 'owned-menu');
      const menu = document.createElement('div');
      menu.id = 'owned-menu';
      menu.setAttribute('role', 'menu');
      document.body.append(menu);
      fireEvent.pointerOver(rail);
      fireEvent.pointerOut(rail, { relatedTarget: menu });
      fireEvent.pointerOver(menu);
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS * 2));
      expect(rail).toHaveAttribute('data-preview', 'true');
      fireEvent.pointerDown(menu);
      expect(rail).toHaveAttribute('data-preview', 'true');
      await act(async () => menu.remove());
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS));
      expect(rail).toHaveAttribute('data-preview', 'false');
      expect(rail).toHaveAttribute('data-pinned', 'false');
    });

    it('follows nested owned menus but ignores unrelated and opposite rail portals', async () => {
      vi.useFakeTimers();
      render(<Harness side={side} />);
      const rail = screen.getByTestId('rail');
      const control = screen.getByRole('button', { name: 'Rail action' });
      control.setAttribute('aria-expanded', 'true');
      control.setAttribute('aria-controls', 'root-menu');
      const menu = document.createElement('div');
      menu.id = 'root-menu';
      menu.setAttribute('role', 'menu');
      const submenuControl = document.createElement('button');
      submenuControl.setAttribute('aria-expanded', 'true');
      submenuControl.setAttribute('aria-controls', 'nested-menu');
      menu.append(submenuControl);
      const submenu = document.createElement('div');
      submenu.id = 'nested-menu';
      submenu.setAttribute('role', 'menu');
      document.body.append(menu, submenu);
      fireEvent.pointerOver(rail);
      fireEvent.pointerOut(rail, { relatedTarget: submenu });
      fireEvent.pointerDown(submenu);
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS * 2));
      expect(rail).toHaveAttribute('data-preview', 'true');
      fireEvent.pointerOut(submenu);
      await act(async () => {
        control.setAttribute('aria-expanded', 'false');
        menu.remove();
        submenu.remove();
      });
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS));
      expect(rail).toHaveAttribute('data-preview', 'false');
      const other = document.createElement('div');
      other.dataset.railPreviewRegion = side === 'left' ? 'right' : 'left';
      other.setAttribute('role', 'menu');
      document.body.append(other);
      fireEvent.pointerOver(screen.getByTestId('trigger'));
      fireEvent.pointerDown(other);
      expect(rail).toHaveAttribute('data-preview', 'false');
      other.remove();
    });

    it('releases on ARIA dismissal and never adopts tooltip or opposite-rail portals', async () => {
      vi.useFakeTimers();
      render(<Harness side={side} />);
      const rail = screen.getByTestId('rail');
      const trigger = screen.getByRole('button', { name: 'Rail action' });
      const menu = document.createElement('div');
      menu.id = 'dismissed-menu';
      menu.setAttribute('role', 'menu');
      document.body.append(menu);
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-controls', menu.id);
      fireEvent.pointerOver(rail);
      fireEvent.pointerOut(rail, { relatedTarget: menu });
      fireEvent.pointerOver(menu);
      await act(async () => trigger.setAttribute('aria-expanded', 'false'));
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS));
      expect(rail).toHaveAttribute('data-preview', 'false');
      menu.setAttribute('role', 'tooltip');
      trigger.setAttribute('aria-expanded', 'true');
      fireEvent.pointerOver(rail);
      fireEvent.pointerOut(rail, { relatedTarget: menu });
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS));
      expect(rail).toHaveAttribute('data-preview', 'false');
      trigger.removeAttribute('aria-controls');
      menu.setAttribute('role', 'menu');
      const opposite = document.createElement('div');
      opposite.dataset.railPreviewRegion = side === 'left' ? 'right' : 'left';
      const oppositeControl = document.createElement('button');
      oppositeControl.setAttribute('aria-expanded', 'true');
      oppositeControl.setAttribute('aria-controls', menu.id);
      opposite.append(oppositeControl);
      document.body.append(opposite);
      fireEvent.pointerOver(rail);
      fireEvent.pointerOut(rail, { relatedTarget: menu });
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS));
      expect(rail).toHaveAttribute('data-preview', 'false');
      menu.remove();
      opposite.remove();
    });

    it('pins an active preview and never auto-hides the pin on leave', () => {
      vi.useFakeTimers();
      render(<Harness side={side} />);
      fireEvent.pointerOver(screen.getByTestId('trigger'));
      fireEvent.click(screen.getByTestId('trigger'));
      fireEvent.pointerOut(screen.getByTestId('rail'));
      act(() => vi.advanceTimersByTime(SHELL_RAIL_PREVIEW_GRACE_MS * 2));
      expect(screen.getByTestId('rail')).toHaveAttribute('data-pinned', 'true');
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'false'
      );
    });

    it('retains overlay placement after dismissal until pinning or a scope reset', () => {
      vi.useFakeTimers();
      const { rerender } = render(<Harness side={side} />);
      fireEvent.pointerOver(screen.getByTestId('trigger'));
      fireEvent.pointerOut(screen.getByTestId('trigger'));
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'false'
      );
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-floating',
        'true'
      );
      fireEvent.click(screen.getByTestId('trigger'));
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-floating',
        'false'
      );
      fireEvent.click(screen.getByTestId('trigger'));
      act(() => screen.getByTestId('outside').focus());
      fireEvent.pointerOver(screen.getByTestId('trigger'));
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-floating',
        'true'
      );
      rerender(<Harness side={side} resetKey='next-route' />);
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-floating',
        'false'
      );
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'false'
      );
    });

    it('offers equivalent keyboard access and Escape does not reopen from retained focus', () => {
      render(<Harness side={side} />);
      act(() => screen.getByTestId('trigger').focus());
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'true'
      );
      fireEvent.keyDown(screen.getByTestId('trigger'), { key: 'Escape' });
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'false'
      );
      expect(screen.getByTestId('trigger')).toHaveFocus();
    });

    it('retains the underlying preview when Escape is consumed by a nested overlay', () => {
      render(<Harness side={side} />);
      fireEvent.pointerOver(screen.getByTestId('trigger'));
      const overlay = render(
        <div role='dialog' aria-label='Rail menu'>
          <button type='button'>Close menu</button>
        </div>
      );
      // Radix dismissable layers own Escape in document capture. Model the
      // overlay closing there, before the rail's document bubble listener.
      document.addEventListener(
        'keydown',
        event => {
          event.preventDefault();
          overlay.unmount();
        },
        { capture: true, once: true }
      );
      fireEvent.keyDown(screen.getByRole('button', { name: 'Close menu' }), {
        key: 'Escape',
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'true'
      );
      fireEvent.keyDown(screen.getByTestId('trigger'), { key: 'Escape' });
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'false'
      );
    });

    it('outside input and route changes cancel pending previews', () => {
      const { rerender } = render(<Harness side={side} />);
      fireEvent.pointerOver(screen.getByTestId('trigger'));
      fireEvent.pointerDown(screen.getByTestId('outside'));
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'false'
      );
      fireEvent.pointerOver(screen.getByTestId('trigger'));
      rerender(<Harness side={side} resetKey='chat' />);
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'false'
      );
    });

    it('does not reopen an explicitly closed pin from a layout-generated hover', () => {
      render(<Harness side={side} />);
      fireEvent.click(screen.getByTestId('trigger'));
      fireEvent.click(screen.getByTestId('trigger'));
      fireEvent.pointerOver(screen.getByTestId('trigger'));
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'false'
      );
      fireEvent.pointerMove(screen.getByTestId('outside'), {
        clientX: 500,
        clientY: 500,
      });
      fireEvent.pointerOver(screen.getByTestId('trigger'));
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'true'
      );
    });

    it('allows fresh keyboard preview after an explicit close when focus moves outside first', () => {
      render(<Harness side={side} />);
      fireEvent.click(screen.getByTestId('trigger'));
      fireEvent.click(screen.getByTestId('trigger'));
      act(() => screen.getByTestId('outside').focus());
      act(() => screen.getByTestId('trigger').focus());
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'true'
      );
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-pinned',
        'false'
      );
    });

    it('disables transient preview for the mobile adapter', () => {
      render(<Harness side={side} enabled={false} />);
      fireEvent.pointerOver(screen.getByTestId('trigger'));
      act(() => screen.getByTestId('trigger').focus());
      expect(screen.getByTestId('rail')).toHaveAttribute(
        'data-preview',
        'false'
      );
    });
  }
);
