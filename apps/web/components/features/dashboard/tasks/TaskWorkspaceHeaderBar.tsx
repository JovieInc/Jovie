'use client';

import { Button, Input } from '@jovie/ui';
import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react';
import type { FormEvent } from 'react';
import {
  TableFilterDropdown,
  type TableFilterDropdownCategory,
} from '@/components/molecules/filters';
import { PageToolbarActionButton } from '@/components/organisms/table';
import {
  DisplayMenuDropdown,
  type ViewMode,
} from '@/components/organisms/table/molecules/DisplayMenuDropdown';
import { cn } from '@/lib/utils';

export type TaskSubviewId = 'all' | 'mine' | 'jovie';

export interface TaskSubviewOption {
  readonly id: TaskSubviewId;
  readonly label: string;
  readonly count: number;
}

export interface TaskWorkspaceHeaderBarProps {
  readonly mode: 'default' | 'create';
  readonly draftTitle: string;
  readonly taskCount: number;
  readonly subviews: ReadonlyArray<TaskSubviewOption>;
  readonly activeSubview: TaskSubviewId;
  readonly onSubviewChange: (subview: TaskSubviewId) => void;
  readonly onDraftTitleChange: (value: string) => void;
  readonly onCancelCreate: () => void;
  readonly onSubmitCreate: (event: FormEvent<HTMLFormElement>) => void;
  readonly createPending: boolean;
  readonly filterCategories: ReadonlyArray<TableFilterDropdownCategory>;
  readonly onClearFilters: () => void;
  readonly viewMode: ViewMode;
  readonly onViewModeChange: (viewMode: ViewMode) => void;
  readonly showCancelledColumn: boolean;
  readonly onShowCancelledColumnChange: (showCancelledColumn: boolean) => void;
  readonly showTaskNavigation?: boolean;
  readonly canSelectPrevious?: boolean;
  readonly canSelectNext?: boolean;
  readonly onSelectPrevious?: () => void;
  readonly onSelectNext?: () => void;
}

export function TaskWorkspaceHeaderBar({
  mode,
  draftTitle,
  taskCount,
  onDraftTitleChange,
  onCancelCreate,
  onSubmitCreate,
  createPending,
  filterCategories,
  onClearFilters,
  viewMode,
  onViewModeChange,
  showCancelledColumn,
  onShowCancelledColumnChange,
  showTaskNavigation = false,
  canSelectPrevious = false,
  canSelectNext = false,
  onSelectPrevious,
  onSelectNext,
  subviews,
  activeSubview,
  onSubviewChange,
}: Readonly<TaskWorkspaceHeaderBarProps>) {
  const createFormId = 'task-workspace-create-form';

  return (
    <div
      data-testid='tasks-workspace-subheader'
      className='flex h-[var(--linear-app-header-height-compact)] min-h-[var(--linear-app-header-height-compact)] items-center justify-between gap-3 px-app-header'
    >
      <div className='min-w-0 flex-1'>
        {mode === 'create' && (
          <form
            id={createFormId}
            onSubmit={onSubmitCreate}
            className='flex min-w-0 items-center gap-2'
          >
            <Input
              value={draftTitle}
              onChange={event => onDraftTitleChange(event.target.value)}
              placeholder='Draft press release, update bio, pitch sync supervisor...'
              aria-label='New task name'
              autoFocus
              className='h-8 max-w-[32rem] min-w-0'
            />
          </form>
        )}
        {mode !== 'create' && (
          <TaskSubviewTabs
            subviews={subviews}
            activeSubview={activeSubview}
            onSubviewChange={onSubviewChange}
            taskCount={taskCount}
          />
        )}
      </div>

      <div className='flex shrink-0 items-center gap-1'>
        {mode === 'create' ? (
          <>
            <Button
              type='submit'
              size='sm'
              form={createFormId}
              disabled={createPending || !draftTitle.trim()}
              className='h-7 px-2.5'
            >
              Create
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={onCancelCreate}
              className='h-7 px-2.5'
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <TableFilterDropdown
              categories={filterCategories}
              onClearAll={onClearFilters}
              iconOnly
              align='end'
              shortcutHint='S'
            />
            <DisplayMenuDropdown
              viewMode={viewMode}
              availableViewModes={['board', 'list']}
              onViewModeChange={onViewModeChange}
              availableColumns={[{ id: 'cancelled', label: 'Cancelled' }]}
              columnVisibility={{ cancelled: showCancelledColumn }}
              onColumnVisibilityChange={(columnId, visible) => {
                if (columnId === 'cancelled') {
                  onShowCancelledColumnChange(visible);
                }
              }}
              trigger={
                <PageToolbarActionButton
                  ariaLabel='Display options'
                  label='Display options'
                  tooltipLabel='Display'
                  iconOnly
                  icon={<Settings2 className='h-3.5 w-3.5' />}
                />
              }
            />
            {showTaskNavigation ? (
              <div className='flex items-center gap-0.5'>
                <PageToolbarActionButton
                  ariaLabel='Previous task'
                  label='Previous task'
                  onClick={onSelectPrevious}
                  tooltipLabel='Previous task'
                  disabled={!canSelectPrevious}
                  iconOnly
                  icon={<ArrowUp className='h-3.5 w-3.5' />}
                />
                <PageToolbarActionButton
                  ariaLabel='Next task'
                  label='Next task'
                  onClick={onSelectNext}
                  tooltipLabel='Next task'
                  disabled={!canSelectNext}
                  iconOnly
                  icon={<ArrowDown className='h-3.5 w-3.5' />}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function TaskSubviewTabs({
  subviews,
  activeSubview,
  onSubviewChange,
  taskCount,
  className,
}: Readonly<{
  subviews: ReadonlyArray<TaskSubviewOption>;
  activeSubview: TaskSubviewId;
  onSubviewChange: (subview: TaskSubviewId) => void;
  taskCount?: number;
  className?: string;
}>) {
  if (subviews.length === 0) {
    return (
      <div className={cn('flex h-full items-center pl-1.5', className)}>
        {typeof taskCount === 'number' ? (
          <span className='text-[10.5px] font-semibold text-tertiary-token'>
            {taskCount === 1 ? '1 Task' : `${taskCount} Tasks`}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role='tablist'
      aria-label='Task subviews'
      className={cn(
        'flex min-w-0 items-center gap-0.5 overflow-x-auto pl-0.5',
        className
      )}
    >
      {subviews.map(subview => {
        const isActive = activeSubview === subview.id;

        return (
          <button
            key={subview.id}
            type='button'
            role='tab'
            aria-selected={isActive}
            onClick={() => onSubviewChange(subview.id)}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-semibold tracking-[-0.012em] transition-[background-color,color]',
              isActive
                ? 'bg-surface-1 text-primary-token'
                : 'text-tertiary-token hover:bg-surface-1 hover:text-primary-token'
            )}
          >
            <span>{subview.label}</span>
            <span
              className={cn(
                'text-[10.5px] tabular-nums',
                isActive ? 'text-tertiary-token' : 'text-quaternary-token'
              )}
            >
              {subview.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
