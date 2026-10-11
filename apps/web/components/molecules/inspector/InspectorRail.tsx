'use client';

// @coverage-via apps/web/components/molecules/inspector/InspectorRail.test.tsx
import type { CommonDropdownItem, SegmentControlOption } from '@jovie/ui';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
import { InspectorEmpty } from './InspectorEmpty';
import { InspectorLoading } from './InspectorLoading';
import { InspectorTabs } from './InspectorTabs';

export const INSPECTOR_TAB_PANEL_ID = 'inspector-tab-panel';

export interface InspectorRailProps<T extends string> {
  readonly isOpen: boolean;
  readonly ariaLabel: string;
  readonly objectHeader?: ReactNode;
  readonly tabs: readonly SegmentControlOption<T>[];
  readonly activeTab: T;
  readonly onTabChange: (value: T) => void;
  readonly tabsAriaLabel: string;
  readonly children: ReactNode;
  readonly isEmpty?: boolean;
  readonly emptyMessage?: string;
  readonly isLoading?: boolean;
  readonly onClose?: () => void;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly contextMenuItems?: CommonDropdownItem[];
  readonly testId?: string;
  readonly width?: number;
}

/**
 * Canonical right-rail Inspector shell.
 *
 * Sticky object header + real tabs. Tab content scrolls. This surface
 * answers: What is this? What does Jovie know? What can I do to THIS object?
 * It is not a task inbox.
 */
export function InspectorShell<T extends string>({
  isOpen,
  ariaLabel,
  objectHeader,
  tabs,
  activeTab,
  onTabChange,
  tabsAriaLabel,
  children,
  isEmpty = false,
  emptyMessage = 'Select an item to inspect.',
  isLoading = false,
  onClose,
  onKeyDown,
  contextMenuItems,
  testId = 'inspector-shell',
  width,
}: InspectorRailProps<T>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const focusedContentRef = useRef<HTMLElement | null>(null);
  const loadingFocusRef = useRef<HTMLElement | null>(null);
  const handingOffFocusRef = useRef(false);

  useLayoutEffect(() => {
    if (!isOpen) {
      focusedContentRef.current = null;
      loadingFocusRef.current = null;
      return;
    }
    const previous = focusedContentRef.current;
    if (isLoading && previous && contentRef.current?.contains(previous)) {
      const tab = bodyRef.current?.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"]'
      );
      if (tab) {
        handingOffFocusRef.current = true;
        tab.focus({ preventScroll: true });
        handingOffFocusRef.current = false;
        loadingFocusRef.current = tab;
      }
    } else if (!isLoading && previous && loadingFocusRef.current) {
      const shouldRestore =
        previous.isConnected &&
        document.activeElement === loadingFocusRef.current;
      focusedContentRef.current = shouldRestore ? previous : null;
      loadingFocusRef.current = null;
      if (shouldRestore) previous.focus({ preventScroll: true });
    }
  }, [isLoading, isOpen]);

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      width={width}
      ariaLabel={ariaLabel}
      onKeyDown={onKeyDown}
      onClose={onClose}
      contextMenuItems={contextMenuItems}
      data-testid={testId}
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      workspaceSurface='flat'
      scrollStrategy='child'
      isEmpty={isEmpty}
      emptyMessage={emptyMessage}
      entityHeader={objectHeader}
    >
      <div
        ref={bodyRef}
        onFocusCapture={event => {
          if (handingOffFocusRef.current) return;
          focusedContentRef.current = contentRef.current?.contains(event.target)
            ? event.target
            : null;
        }}
        onBlurCapture={event => {
          if (
            !isLoading &&
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            focusedContentRef.current = null;
          }
        }}
        onPointerDownCapture={() => {
          if (isLoading) focusedContentRef.current = null;
        }}
        className='flex min-h-0 flex-1 flex-col overflow-hidden'
        data-testid='inspector-tabbed-body'
        data-inspector-shell='true'
      >
        <div className='shrink-0 border-b border-(--app-shell-frame-seam) px-3'>
          <InspectorTabs
            value={activeTab}
            onValueChange={onTabChange}
            options={tabs}
            ariaLabel={tabsAriaLabel}
            panelId={INSPECTOR_TAB_PANEL_ID}
          />
        </div>
        <div className='relative flex min-h-0 flex-1 flex-col'>
          <div
            id={INSPECTOR_TAB_PANEL_ID}
            role='tabpanel'
            data-testid='inspector-tab-panel'
            data-scroll-mode='internal'
            aria-busy={isLoading}
            className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3'
          >
            {/* Keep content mounted so a refresh retains edits and scroll height.
                Inert content cannot expose stale actions while facts are loading. */}
            <div
              ref={contentRef}
              inert={isLoading}
              aria-hidden={isLoading}
              className={isLoading ? 'invisible' : undefined}
            >
              {children ?? <InspectorEmpty message='Nothing to show yet.' />}
            </div>
          </div>
          {isLoading ? (
            <div className='absolute inset-0 overflow-hidden'>
              <InspectorLoading />
            </div>
          ) : null}
        </div>
      </div>
    </EntitySidebarShell>
  );
}
