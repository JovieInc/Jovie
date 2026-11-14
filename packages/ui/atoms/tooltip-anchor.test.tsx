/**
 * Anchor invariant: tooltip content never outlives its trigger.
 *
 * A tooltip that stays painted after its trigger unmounts, hides, or leaves
 * view is an orphan (founder report: the collapsing sidebar left a "What's
 * new" tooltip stranded in the corner). The shared root owns the rule so no
 * screen has to remember it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SimpleTooltip } from './simple-tooltip';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

type IntersectionCallback = (
  entries: Array<Pick<IntersectionObserverEntry, 'isIntersecting'>>
) => void;

const intersectionCallbacks = new Set<IntersectionCallback>();
const resizeCallbacks = new Set<(entries: never[]) => void>();
const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionCallback) {}
      observe() {
        intersectionCallbacks.add(this.callback);
      }
      disconnect() {
        intersectionCallbacks.delete(this.callback);
      }
    }
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: (entries: never[]) => void) {}
      observe() {
        resizeCallbacks.add(this.callback);
      }
      unobserve() {}
      disconnect() {
        resizeCallbacks.delete(this.callback);
      }
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.ResizeObserver = originalResizeObserver;
  intersectionCallbacks.clear();
  resizeCallbacks.clear();
});

const content = () => screen.queryByTestId('tooltip-content');
const settle = () => act(async () => {});

function Fixture({
  showTrigger = true,
  containerStyle,
  containerProps,
  onOpenChange,
}: {
  readonly showTrigger?: boolean;
  readonly containerStyle?: React.CSSProperties;
  readonly containerProps?: React.HTMLAttributes<HTMLDivElement> & {
    readonly inert?: boolean;
  };
  readonly onOpenChange?: (open: boolean) => void;
}) {
  return (
    <TooltipProvider>
      <div data-testid='container' style={containerStyle} {...containerProps}>
        <Tooltip defaultOpen onOpenChange={onOpenChange}>
          {showTrigger ? (
            <TooltipTrigger>
              <button type='button'>Trigger</button>
            </TooltipTrigger>
          ) : null}
          <TooltipContent>Label</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

describe('Tooltip anchor invariant', () => {
  it('shows content while the trigger is mounted and visible', async () => {
    render(<Fixture />);
    await settle();
    expect(content()).toBeInTheDocument();
  });

  it('closes when the trigger unmounts', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<Fixture onOpenChange={onOpenChange} />);
    await settle();
    expect(content()).toBeInTheDocument();

    rerender(<Fixture showTrigger={false} onOpenChange={onOpenChange} />);
    await settle();
    expect(content()).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['display:none', { containerStyle: { display: 'none' } }],
    ['visibility:hidden', { containerStyle: { visibility: 'hidden' } }],
    ['the hidden attribute', { containerProps: { hidden: true } }],
    ['inert', { containerProps: { inert: true } }],
    ['aria-hidden', { containerProps: { 'aria-hidden': true } }],
  ] as const)(
    'closes when the trigger container gets %s',
    async (_name, props) => {
      const { rerender } = render(<Fixture />);
      await settle();
      expect(content()).toBeInTheDocument();

      rerender(<Fixture {...props} />);
      await settle();
      expect(content()).not.toBeInTheDocument();
    }
  );

  it('closes when the trigger leaves the viewport or its clipping container', async () => {
    render(<Fixture />);
    await settle();
    expect(content()).toBeInTheDocument();

    act(() => {
      for (const callback of intersectionCallbacks)
        callback([{ isIntersecting: false }]);
    });
    await settle();
    expect(content()).not.toBeInTheDocument();
    // Closed tooltips hold no observers.
    expect(intersectionCallbacks.size).toBe(0);
    expect(resizeCallbacks.size).toBe(0);
  });

  it('closes when the trigger collapses to zero size', async () => {
    render(<Fixture />);
    await settle();
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 0, 0));
    act(() => {
      for (const callback of resizeCallbacks) callback([]);
    });
    await settle();
    expect(content()).not.toBeInTheDocument();
    rect.mockRestore();
  });

  it('keeps a controlled tooltip hidden while detached and restores it after', async () => {
    function Controlled({ hidden }: { readonly hidden: boolean }) {
      return (
        <TooltipProvider>
          <div style={{ display: hidden ? 'none' : undefined }}>
            <Tooltip open>
              <TooltipTrigger>
                <button type='button'>Trigger</button>
              </TooltipTrigger>
              <TooltipContent>Label</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      );
    }
    const { rerender } = render(<Controlled hidden={false} />);
    await settle();
    expect(content()).toBeInTheDocument();
    rerender(<Controlled hidden />);
    await settle();
    expect(content()).not.toBeInTheDocument();
    rerender(<Controlled hidden={false} />);
    await settle();
    expect(content()).toBeInTheDocument();
  });

  it('tells a forcing owner when intent ends, so it cannot reopen unhovered', async () => {
    // The founder-reported orphan: an owner forces the tooltip closed, hears
    // "open" from a hover, never hears the matching close, and shows the
    // tooltip later with no pointer on it.
    function Owner({ forcedClosed }: { readonly forcedClosed: boolean }) {
      const [intent, setIntent] = React.useState(false);
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip
            open={forcedClosed ? false : intent}
            onOpenChange={setIntent}
          >
            <TooltipTrigger>
              <button type='button'>Trigger</button>
            </TooltipTrigger>
            <TooltipContent>Label</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    const { rerender } = render(<Owner forcedClosed />);
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    fireEvent.focus(trigger);
    await settle();
    expect(content()).not.toBeInTheDocument();
    fireEvent.blur(trigger);
    await settle();

    rerender(<Owner forcedClosed={false} />);
    await settle();
    expect(content()).not.toBeInTheDocument();
  });

  it('applies to SimpleTooltip', async () => {
    function Simple({ hidden }: { readonly hidden: boolean }) {
      return (
        <TooltipProvider>
          <div hidden={hidden}>
            <SimpleTooltip content='Label' defaultOpen>
              <button type='button'>Trigger</button>
            </SimpleTooltip>
          </div>
        </TooltipProvider>
      );
    }
    const { rerender } = render(<Simple hidden={false} />);
    await settle();
    expect(content()).toBeInTheDocument();
    rerender(<Simple hidden />);
    await settle();
    expect(content()).not.toBeInTheDocument();
  });
});
