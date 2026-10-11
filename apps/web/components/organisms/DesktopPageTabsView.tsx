'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Plus, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type {
  DesktopPageTabsCommand,
  DesktopPageTabsState,
} from '@/lib/desktop/electron-bridge';

/** Window-owned pages, rendered only in the main column above its header. */
export function DesktopPageTabsView({
  state,
  command,
  panelId,
}: {
  readonly panelId?: string;
  readonly state: DesktopPageTabsState | null;
  readonly command: (command: DesktopPageTabsCommand) => Promise<boolean>;
}) {
  const [failed, setFailed] = useState(false);
  const tablist = useRef<HTMLDivElement>(null);
  const closingId = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (
      state &&
      closingId.current !== null &&
      !state.tabs.some(tab => tab.id === closingId.current)
    ) {
      closingId.current = null;
      tablist.current
        ?.querySelector<HTMLButtonElement>(
          `[data-page-tab-id="${state.activeId}"]`
        )
        ?.focus();
    }
  }, [state]);
  if (!state)
    return (
      <div
        data-electron-page-tabs='true'
        data-electron-drag-region='true'
        aria-hidden='true'
      />
    );

  const run = async (request: Parameters<typeof command>[0]) => {
    setFailed(false);
    if (request.type === 'close') closingId.current = request.id;
    try {
      if (!(await command(request)) && request.type !== 'close')
        setFailed(true);
    } catch {
      if (request.type !== 'close') setFailed(true);
    }
  };
  const focusTab = (id: number) =>
    tablist.current
      ?.querySelector<HTMLButtonElement>(`[data-page-tab-id="${id}"]`)
      ?.focus();

  return (
    <div
      data-electron-page-tabs='true'
      data-electron-drag-region='true'
      className='flex min-w-0 shrink-0 items-center gap-1'
    >
      <div
        ref={tablist}
        role='tablist'
        aria-label='Open Pages'
        className='flex min-w-0 flex-1 items-center gap-1 overflow-x-auto'
      >
        {state.tabs.map((tab, index) => (
          <div
            key={tab.id}
            className='group/page-tab flex min-w-24 flex-1 basis-0 items-center rounded-full'
            data-active={tab.id === state.activeId}
          >
            <Button
              type='button'
              variant={tab.id === state.activeId ? 'tertiary' : 'ghost'}
              size='sm'
              role='tab'
              aria-selected={tab.id === state.activeId}
              aria-controls={panelId}
              aria-busy={tab.loading || undefined}
              tabIndex={tab.id === state.activeId ? 0 : -1}
              data-page-tab-id={tab.id}
              className='min-w-0 flex-1 [&>span]:min-w-0'
              onClick={() => {
                void run({ type: 'select', id: tab.id });
              }}
              onKeyDown={event => {
                let target: number | undefined;
                if (event.key === 'ArrowRight')
                  target = (index + 1) % state.tabs.length;
                if (event.key === 'ArrowLeft')
                  target = (index - 1 + state.tabs.length) % state.tabs.length;
                if (event.key === 'Home') target = 0;
                if (event.key === 'End') target = state.tabs.length - 1;
                if (event.key === 'Delete') {
                  event.preventDefault();
                  void run({ type: 'close', id: tab.id });
                }
                if (target !== undefined) {
                  event.preventDefault();
                  const id = state.tabs[target].id;
                  focusTab(id);
                  void run({ type: 'select', id });
                }
              }}
            >
              <span className='truncate'>{tab.title}</span>
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon-xs'
              aria-label={`Close ${tab.title} tab`}
              className='mr-1 shrink-0'
              onClick={() => {
                void run({ type: 'close', id: tab.id });
              }}
            >
              <X className='size-3' aria-hidden='true' />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        aria-label='New Tab'
        title='New Tab'
        className='shrink-0'
        onClick={() => {
          void run({ type: 'create' });
        }}
      >
        <Plus className='size-3.5' aria-hidden='true' />
      </Button>
      {failed ? (
        <span role='alert' className='sr-only'>
          Could not open the page. Try again.
        </span>
      ) : null}
    </div>
  );
}
