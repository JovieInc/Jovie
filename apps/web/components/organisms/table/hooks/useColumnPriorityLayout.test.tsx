import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ColumnPrioritySpec } from '../column-priority';
import { useColumnPriorityLayout } from './useColumnPriorityLayout';

const columns: readonly ColumnPrioritySpec[] = [
  { id: 'fan', minWidth: 200 },
  { id: 'meta', priority: 1, minWidth: 200 },
];

function Probe() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const layout = useColumnPriorityLayout(columns, node, { initialWidth: 800 });
  return (
    <div ref={setNode} data-testid='probe'>
      {layout.hiddenIds.join(',') || 'all'}
    </div>
  );
}

describe('useColumnPriorityLayout', () => {
  it('follows the shared observer and ignores a boundary flicker', async () => {
    let callback: ResizeObserverCallback | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        constructor(next: ResizeObserverCallback) {
          callback = next;
        }

        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      }
    );

    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('all');

    const fire = (width: number) => {
      callback?.(
        [
          {
            contentRect: { width },
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver
      );
    };

    await act(async () => {
      fire(320);
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('meta');

    await act(async () => {
      fire(405);
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('meta');

    await act(async () => {
      fire(420);
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('all');

    vi.unstubAllGlobals();
  });
});
