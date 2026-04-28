import { fireEvent, render, screen } from '@testing-library/react';
import { Play } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenuOverlay } from './ContextMenuOverlay';
import type { ContextMenuState } from './context-menu.types';

describe('ContextMenuOverlay', () => {
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

  it('fires onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const state: ContextMenuState = {
      x: 0,
      y: 0,
      items: [{ label: 'Play', onSelect: () => undefined }],
    };
    render(<ContextMenuOverlay state={state} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(onClose).toHaveBeenCalledOnce();
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
