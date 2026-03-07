'use client';

import { AlertTriangle, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { DemoAvatar } from './DemoAvatar';
import { DemoPriorityIcon } from './DemoPriorityIcon';
import { DemoStatusIcon } from './DemoStatusIcon';
import type { DemoRelease, ReleaseStatus } from './demo-types';

// ── Status group labels (sentence case) ──

const STATUS_LABEL: Record<ReleaseStatus, string> = {
  syncing: 'In Progress',
  scheduled: 'Scheduled',
  live: 'Live',
  draft: 'Draft',
  archived: 'Archived',
};

// Statuses that show a warning icon (like Linear's ⚠ on "In Review")
const WARNING_STATUSES = new Set<ReleaseStatus>(['syncing']);

// ── Props ──

interface DemoReleasesPanelProps {
  readonly groups: { status: ReleaseStatus; releases: DemoRelease[] }[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

export function DemoReleasesPanel({
  groups,
  selectedId,
  onSelect,
}: DemoReleasesPanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ReleaseStatus>>(
    () => new Set()
  );
  const [focusIndex, setFocusIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Build flat list of IDs for keyboard navigation
  const flatIds = groups.flatMap(g =>
    collapsedGroups.has(g.status) ? [] : g.releases.map(r => r.id)
  );

  const toggleGroup = (status: ReleaseStatus) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (flatIds.length === 0) return;

      let nextIndex: number;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        nextIndex = Math.min(focusIndex + 1, flatIds.length - 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        nextIndex = Math.max(focusIndex - 1, 0);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < flatIds.length) {
          onSelect(flatIds[focusIndex]);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onSelect('');
        return;
      } else {
        return;
      }

      setFocusIndex(nextIndex);
      // Scroll row into view
      const row = listRef.current?.querySelector(
        `[data-release-id="${flatIds[nextIndex]}"]`
      );
      row?.scrollIntoView({ block: 'nearest' });
    },
    [flatIds, focusIndex, onSelect]
  );

  return (
    <div // NOSONAR - custom listbox pattern with keyboard navigation, native <select> not suitable for this UI
      ref={listRef}
      className='h-full overflow-y-auto overflow-x-hidden outline-none scrollbar-hide'
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role='listbox'
      aria-label='Releases'
    >
      {groups.map(group => {
        const isCollapsed = collapsedGroups.has(group.status);

        return (
          <div key={group.status}>
            {/* Group header */}
            <button
              type='button'
              onClick={() => toggleGroup(group.status)}
              className='sticky top-0 z-10 flex w-full items-center gap-2 bg-surface-1 px-4 h-[28px] text-[13px] text-tertiary-token hover:text-secondary-token [font-weight:var(--font-weight-medium)]'
              aria-label={`Toggle ${STATUS_LABEL[group.status]} releases section`}
            >
              <ChevronRight
                className={cn(
                  'size-3.5 shrink-0 transition-transform duration-fast text-tertiary-token',
                  !isCollapsed && 'rotate-90'
                )}
                aria-hidden='true'
              />
              <DemoStatusIcon status={group.status} />
              {WARNING_STATUSES.has(group.status) && (
                <AlertTriangle className='size-3 text-yellow-500/80' />
              )}
              <span>{STATUS_LABEL[group.status]}</span>
              <span className='text-quaternary-token text-[12px]'>
                {group.releases.length}
              </span>
              <span className='flex-1' />
              <button
                type='button'
                className='size-5 flex items-center justify-center rounded text-tertiary-token hover:text-primary-token hover:bg-interactive-hover transition-colors'
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
                aria-label={`Add ${STATUS_LABEL[group.status]} release`}
              >
                <Plus className='size-3.5' />
              </button>
            </button>

            {/* Rows */}
            {!isCollapsed &&
              group.releases.map(release => {
                const globalIndex = flatIds.indexOf(release.id);
                const isFocused = globalIndex === focusIndex;
                const isSelected = release.id === selectedId;

                return (
                  <div // NOSONAR - custom listbox option with keyboard support
                    key={release.id}
                    data-release-id={release.id}
                    role='option'
                    tabIndex={0}
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect(release.id);
                      setFocusIndex(globalIndex);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(release.id);
                        setFocusIndex(globalIndex);
                      }
                    }}
                    className={cn(
                      'flex h-[34px] cursor-pointer items-center gap-3 px-4 text-app shadow-[inset_0_-1px_0_var(--color-border-subtle)]',
                      isSelected &&
                        'bg-accent/10 shadow-[inset_2px_0_0_var(--color-accent),inset_0_-1px_0_var(--color-border-subtle)]',
                      isFocused && !isSelected && 'bg-interactive-hover',
                      !isSelected && !isFocused && 'hover:bg-interactive-hover'
                    )}
                  >
                    {/* Priority */}
                    {release.priority === 'none' ? (
                      <span className='size-4' />
                    ) : (
                      <DemoPriorityIcon priority={release.priority} />
                    )}

                    {/* Release ID */}
                    <span className='hidden shrink-0 text-[12px] text-quaternary-token font-mono sm:block w-[54px]'>
                      {release.displayId}
                    </span>

                    {/* Status icon */}
                    <DemoStatusIcon status={release.status} />

                    {/* Title + artist inline */}
                    <div className='min-w-0 flex-1 flex items-baseline gap-2'>
                      <span className='truncate text-[13px] font-medium text-primary-token'>
                        {release.title}
                      </span>
                      <span className='truncate text-[12px] text-tertiary-token'>
                        {release.artist}
                      </span>
                    </div>

                    {/* Labels */}
                    <div className='hidden items-center gap-1 sm:flex'>
                      {release.labels.slice(0, 2).map(label => (
                        <span
                          key={label.id}
                          className='flex items-center gap-1.5 rounded-[2px] border border-subtle bg-interactive-hover px-1.5 py-0.5 text-[10px] text-secondary-token [font-weight:var(--font-weight-medium)]'
                        >
                          <span
                            className='size-1.5 rounded-full'
                            style={{ backgroundColor: label.color }}
                          />
                          {label.name}
                        </span>
                      ))}
                    </div>

                    {/* Type badge */}
                    <span className='hidden shrink-0 text-2xs text-quaternary-token lg:block'>
                      {release.type}
                    </span>

                    {/* Assignee */}
                    <DemoAvatar assignee={release.assignee} size={16} />

                    {/* Date */}
                    <span className='hidden shrink-0 text-[12px] text-quaternary-token xl:block w-16 text-right'>
                      {release.releaseDate}
                    </span>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
