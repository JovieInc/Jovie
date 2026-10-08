import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { Play } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenuOverlay } from './ContextMenuOverlay';
import type { ContextMenuState } from './context-menu.types';

describe('ContextMenuOverlay', () => {
  it('focuses enabled menu actions, supports arrow navigation and restores the trigger on Escape', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { rerender } = render(
      <ContextMenuOverlay
        state={{
          x: 100,
          y: 100,
          items: [
            { label: 'First', onSelect: vi.fn() },
            { label: 'Disabled', onSelect: vi.fn(), disabled: true },
            { label: 'Last', onSelect: vi.fn() },
          ],
        }}
        onClose={onClose}
      />
    );
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<ContextMenuOverlay state={null} onClose={vi.fn()} />);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
  it('renders nothing when state is null', () => {
    const { container } = render(
      <ContextMenuOverlay state={null} onClose={() => undefined} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one menuitem per action item', () => {
    const state: ContextMenuState = {
      x: 100,
      y: 100,
      items: [
        { label: 'Play', onSelect: () => undefined },
        { label: 'Pause', onSelect: () => undefined },
      ],
    };
    render(<ContextMenuOverlay state={state} onClose={() => undefined} />);
    expect(screen.getAllByRole('menuitem').length).toBe(2);
  });

  it('renders a separator between item groups', () => {
    const state: ContextMenuState = {
      x: 0,
      y: 0,
      items: [
        { label: 'Play', onSelect: () => undefined },
        { kind: 'separator' },
        { label: 'Delete', onSelect: () => undefined },
      ],
    };
    const { container } = render(
      <ContextMenuOverlay state={state} onClose={() => undefined} />
    );
    // The separator renders a div with border-t aria-hidden — count menuitems instead
    expect(screen.getAllByRole('menuitem').length).toBe(2);
    expect(
      container.querySelectorAll('[aria-hidden="true"].border-t').length
    ).toBe(1);
  });

  it('fires onSelect + onClose when an item is clicked', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const state: ContextMenuState = {
      x: 0,
      y: 0,
      items: [{ label: 'Play', onSelect }],
    };
    render(<ContextMenuOverlay state={state} onClose={onClose} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /Play/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('skips onSelect on a disabled item', () => {
    const onSelect = vi.fn();
    const state: ContextMenuState = {
      x: 0,
      y: 0,
      items: [{ label: 'Play', onSelect, disabled: true }],
    };
    render(<ContextMenuOverlay state={state} onClose={() => undefined} />);
    const item = screen.getByRole('menuitem', { name: /Play/ });
    expect(item).toBeDisabled();
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('dismisses without intercepting the outside focus target', () => {
    const onClose = vi.fn();
    const state: ContextMenuState = {
      x: 0,
      y: 0,
      items: [{ label: 'Play', onSelect: () => undefined }],
    };
    render(<ContextMenuOverlay state={state} onClose={onClose} />);
    const target = document.createElement('button');
    document.body.append(target);
    fireEvent.pointerDown(target);
    target.focus();
    expect(onClose).toHaveBeenCalledOnce();
    expect(target).toHaveFocus();
    target.remove();
  });

  it('renders an icon when supplied', () => {
    const state: ContextMenuState = {
      x: 0,
      y: 0,
      items: [{ label: 'Play', icon: Play, onSelect: () => undefined }],
    };
    const { container } = render(
      <ContextMenuOverlay state={state} onClose={() => undefined} />
    );
    // lucide icons render as svg with class "lucide-play"
    expect(container.querySelector('svg.lucide-play')).not.toBeNull();
  });

  it('renders a known shortcut as its keys string', () => {
    const state: ContextMenuState = {
      x: 0,
      y: 0,
      items: [
        {
          label: 'Play / pause',
          shortcut: 'playPause',
          onSelect: () => undefined,
        },
      ],
    };
    render(<ContextMenuOverlay state={state} onClose={() => undefined} />);
    expect(screen.getByText('Space')).toBeInTheDocument();
  });

  it('renders a raw shortcut string verbatim', () => {
    const state: ContextMenuState = {
      x: 0,
      y: 0,
      items: [
        {
          label: 'Custom',
          shortcut: '⌘D',
          onSelect: () => undefined,
        },
      ],
    };
    render(<ContextMenuOverlay state={state} onClose={() => undefined} />);
    expect(screen.getByText('⌘D')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    const state: ContextMenuState = {
      x: 0,
      y: 0,
      items: [{ label: 'Play', onSelect: () => undefined }],
    };
    render(<ContextMenuOverlay state={state} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(
      resolve(__dirname, './ContextMenuOverlay.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/--linear-app-/);
  });
});
