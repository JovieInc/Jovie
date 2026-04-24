'use client';

import { Button, Input } from '@jovie/ui';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import {
  TableFilterDropdown,
  type TableFilterDropdownCategory,
} from '@/components/molecules/filters';
import { PageToolbarActionButton } from '@/components/organisms/table';
import { cn } from '@/lib/utils';

export interface TaskWorkspaceHeaderBarProps {
  readonly mode: 'default' | 'search' | 'create';
  readonly search: string;
  readonly draftTitle: string;
  readonly taskCount: number;
  readonly onSearchChange: (value: string) => void;
  readonly onDraftTitleChange: (value: string) => void;
  readonly onEnterSearch: () => void;
  readonly onExitSearch: () => void;
  readonly onCancelCreate: () => void;
  readonly onSubmitCreate: (event: FormEvent<HTMLFormElement>) => void;
  readonly createPending: boolean;
  readonly filterCategories: ReadonlyArray<TableFilterDropdownCategory>;
  readonly onClearFilters: () => void;
  readonly showTaskNavigation?: boolean;
  readonly canSelectPrevious?: boolean;
  readonly canSelectNext?: boolean;
  readonly onSelectPrevious?: () => void;
  readonly onSelectNext?: () => void;
}

export function TaskWorkspaceHeaderBar({
  mode,
  search,
  draftTitle,
  taskCount,
  onSearchChange,
  onDraftTitleChange,
  onEnterSearch,
  onExitSearch,
  onCancelCreate,
  onSubmitCreate,
  createPending,
  filterCategories,
  onClearFilters,
  showTaskNavigation = false,
  canSelectPrevious = false,
  canSelectNext = false,
  onSelectPrevious,
  onSelectNext,
}: Readonly<TaskWorkspaceHeaderBarProps>) {
  const createFormId = 'task-workspace-create-form';

  return (
    <div
      data-testid='tasks-workspace-subheader'
      className='flex h-[var(--linear-app-header-height-compact)] min-h-[var(--linear-app-header-height-compact)] items-center justify-between gap-3 px-app-header'
    >
      <div className='min-w-0 flex-1'>
        {mode === 'search' && (
          <AppSearchField
            value={search}
            onChange={onSearchChange}
            onEscape={onExitSearch}
            placeholder='Search Tasks'
            ariaLabel='Search tasks'
            autoFocus
            className='h-8 max-w-[28rem] bg-transparent'
            inputClassName='text-xs'
          />
        )}
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
        {mode !== 'search' && mode !== 'create' && (
          <div className='flex h-full items-center pl-1.5'>
            <span className='text-[10.5px] font-semibold text-tertiary-token'>
              {taskCount === 1 ? '1 Task' : `${taskCount} Tasks`}
            </span>
          </div>
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
            {mode === 'search' ? (
              <PageToolbarActionButton
                ariaLabel='Close search'
                label='Close search'
                onClick={onExitSearch}
                icon={<X className='h-3.5 w-3.5' />}
                iconOnly
                tooltipLabel='Close search'
              />
            ) : (
              <PageToolbarActionButton
                ariaLabel='Search tasks'
                label='Search tasks'
                onClick={onEnterSearch}
                tooltipLabel='Search'
                tooltipShortcut='/'
                iconOnly
                data-app-search-trigger='true'
                icon={<Search className='h-3.5 w-3.5' />}
              />
            )}
            <div className={cn(mode === 'search' && 'opacity-100')}>
              <TableFilterDropdown
                categories={filterCategories}
                onClearAll={onClearFilters}
                iconOnly
                align='end'
                shortcutHint='S'
              />
            </div>
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
