'use client';

import { Button, Input } from '@jovie/ui';
import { ArrowDown, ArrowUp, Plus, Settings2 } from 'lucide-react';
import type { FormEvent } from 'react';
import {
  TableFilterDropdown,
  type TableFilterDropdownCategory,
} from '@/components/molecules/filters';
import { HeaderSearchAction } from '@/components/molecules/HeaderSearchAction';
import { TabBar } from '@/components/molecules/tab-bar/TabBar';
import {
  PageToolbar,
  PageToolbarActionButton,
} from '@/components/organisms/table';
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
  readonly searchValue: string;
  readonly onSearchValueChange: (value: string) => void;
  readonly onClearSearch: () => void;
  readonly filterCategories: ReadonlyArray<TableFilterDropdownCategory>;
  readonly onClearFilters: () => void;
  readonly onCreateTask: () => void;
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
  searchValue,
  onSearchValueChange,
  onClearSearch,
  filterCategories,
  onClearFilters,
  onCreateTask,
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

  const toolbarStart =
    mode === 'create' ? (
      <form
        id={createFormId}
        onSubmit={onSubmitCreate}
        className='flex min-w-0 flex-1 items-center gap-2'
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
    ) : (
      <TaskSubviewTabs
        subviews={subviews}
        activeSubview={activeSubview}
        onSubviewChange={onSubviewChange}
        taskCount={taskCount}
      />
    );

  const toolbarEnd =
    mode === 'create' ? (
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
        <HeaderSearchAction
          searchValue={searchValue}
          onSearchValueChange={onSearchValueChange}
          onClearAction={onClearSearch}
          placeholder='Search tasks'
          ariaLabel='Search tasks'
          submitAriaLabel='Search tasks'
          tooltipLabel='Search'
          className='hidden h-7 text-xs text-tertiary-token hover:text-primary-token lg:flex'
        />
        <TableFilterDropdown
          categories={filterCategories}
          onClearAll={onClearFilters}
          iconOnly
          align='end'
          shortcutHint='S'
        />
        <PageToolbarActionButton
          ariaLabel='Create task'
          label='New Task'
          onClick={onCreateTask}
          icon={<Plus className='h-3.5 w-3.5' />}
          className='hidden bg-primary-token px-2.5 text-on-primary hover:bg-primary-token/90 hover:text-on-primary lg:inline-flex'
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
    );

  return (
    <div data-testid='tasks-workspace-subheader' className='contents'>
      <PageToolbar
        start={toolbarStart}
        end={toolbarEnd}
        className='h-[var(--linear-app-header-height-compact)] min-h-[var(--linear-app-header-height-compact)]'
        startClassName={mode === 'create' ? 'overflow-visible' : undefined}
        endClassName='gap-0.5'
      />
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
    <TabBar<TaskSubviewId>
      value={activeSubview}
      onValueChange={onSubviewChange}
      ariaLabel='Task subviews'
      overflowMode='scroll'
      variant='segment'
      className={cn('pl-0', className)}
      triggerClassName='gap-1.5 px-2 text-[12px]'
      options={subviews.map(subview => ({
        value: subview.id,
        label: (
          <span className='inline-flex min-w-0 items-center gap-1.5'>
            <span>{subview.label}</span>
            <span className='text-[10.5px] tabular-nums opacity-70'>
              {subview.count}
            </span>
          </span>
        ),
      }))}
    />
  );
}
