import { render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SidebarThread, SidebarThreadRow } from './SidebarThreadsSection';

vi.mock('next/link', () => ({
  default: React.forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

const threads: SidebarThread[] = ['Release rollout', 'Pitch tasks', 'Tour'].map(
  (title, index) => ({
    id: `thread-${index}`,
    href: `/app/chat/thread-${index}`,
    title,
    status: 'complete',
    updatedAt: '2026-05-10T00:00:00.000Z',
  })
);

describe('shared thread title observer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('serves every row from one observer and one set of global listeners', () => {
    const observers: { observed: Element[]; disconnected: boolean }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private readonly record = {
          observed: [] as Element[],
          disconnected: false,
        };
        constructor() {
          observers.push(this.record);
        }
        observe(target: Element) {
          this.record.observed.push(target);
        }
        unobserve(target: Element) {
          this.record.observed = this.record.observed.filter(
            element => element !== target
          );
        }
        disconnect() {
          this.record.disconnected = true;
        }
      }
    );
    const addListener = vi.spyOn(globalThis, 'addEventListener');
    const removeListener = vi.spyOn(globalThis, 'removeEventListener');
    const resizeListeners = (spy: typeof addListener) =>
      spy.mock.calls.filter(([type]) => type === 'resize').length;

    const { unmount } = render(
      <div>
        {threads.map(thread => (
          <SidebarThreadRow
            key={thread.id}
            thread={thread}
            active={false}
            unread={false}
          />
        ))}
      </div>
    );

    expect(observers).toHaveLength(1);
    expect(observers[0]?.observed).toHaveLength(threads.length);
    expect(resizeListeners(addListener)).toBe(1);

    unmount();

    expect(observers[0]?.disconnected).toBe(true);
    expect(resizeListeners(removeListener)).toBe(1);
  });
});
