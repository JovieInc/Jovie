'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { DemoAvatar } from './DemoAvatar';
import { DemoPriorityIcon } from './DemoPriorityIcon';
import { DemoStatusIcon } from './DemoStatusIcon';
import type { DemoRelease, ReleaseStatus } from './demo-types';

// ── Status group labels ──

const STATUS_LABEL: Record<ReleaseStatus, string> = {
  syncing: 'In Progress',
  scheduled: 'Scheduled',
  live: 'Live',
  draft: 'Draft',
  archived: 'Archived',
};

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

      let nextIndex = focusIndex;

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
    <div
      ref={listRef}
      className='h-full overflow-y-auto overflow-x-hidden outline-none'
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
              className='sticky top-0 z-10 flex w-full items-center gap-2 border-b border-subtle bg-surface-1 px-4 py-1.5 text-2xs font-medium text-tertiary-token hover:text-secondary-token'
            >
              <DemoStatusIcon status={group.status} />
              <span>{STATUS_LABEL[group.status]}</span>
              <span className='text-quaternary-token'>
                {group.releases.length}
              </span>
              <svg
                className={cn(
                  'ml-auto size-3 transition-transform duration-fast',
                  isCollapsed && '-rotate-90'
                )}
                viewBox='0 0 12 12'
                fill='none'
                role='img'
                aria-hidden='true'
              >
                <title>Toggle group</title>
                <path
                  d='M3 4.5L6 7.5L9 4.5'
                  stroke='currentColor'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              </svg>
            </button>

            {/* Rows */}
            {!isCollapsed &&
              group.releases.map((release, i) => {
                const globalIndex = flatIds.indexOf(release.id);
                const isFocused = globalIndex === focusIndex;
                const isSelected = release.id === selectedId;

                return (
                  <div
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
                      'flex cursor-pointer items-center gap-3 border-b border-subtle px-4 py-2 text-app transition-colors duration-fast',
                      isSelected && 'bg-interactive-active',
                      isFocused && !isSelected && 'bg-interactive-hover',
                      !isSelected && !isFocused && 'hover:bg-interactive-hover'
                    )}
                    style={{
                      opacity: 1,
                      transform: 'translateY(0)',
                      transition: `opacity 0.3s ease ${i * 30}ms, transform 0.3s ease ${i * 30}ms, background-color var(--duration-fast) var(--ease-interactive)`,
                    }}
                  >
                    {/* Status icon */}
                    <DemoStatusIcon status={release.status} />

                    {/* Title + artist */}
                    <div className='min-w-0 flex-1'>
                      <p className='truncate font-medium text-primary-token'>
                        {release.title}
                      </p>
                      <p className='truncate text-2xs text-tertiary-token'>
                        {release.artist}
                      </p>
                    </div>

                    {/* Labels */}
                    <div className='hidden items-center gap-1 sm:flex'>
                      {release.labels.slice(0, 2).map(label => (
                        <span
                          key={label.id}
                          className='rounded-xs px-1.5 py-0.5 text-[10px] font-medium'
                          style={{
                            backgroundColor: `${label.color}20`,
                            color: label.color,
                          }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>

                    {/* Type badge */}
                    <span className='hidden shrink-0 text-2xs text-quaternary-token lg:block'>
                      {release.type}
                    </span>

                    {/* Priority */}
                    {release.priority !== 'none' && (
                      <DemoPriorityIcon priority={release.priority} />
                    )}

                    {/* Assignee */}
                    <DemoAvatar assignee={release.assignee} />

                    {/* Date */}
                    <span className='hidden shrink-0 text-2xs text-quaternary-token xl:block'>
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
