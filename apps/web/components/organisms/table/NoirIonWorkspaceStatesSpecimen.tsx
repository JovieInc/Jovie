'use client';

import {
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_TAB_ACTIVE_CLASS,
  PAGE_TOOLBAR_TAB_BUTTON_CLASS,
  PageToolbar,
  PageToolbarActionButton,
  PageToolbarTabButton,
} from '@/components/organisms/table/molecules/PageToolbar';
import { rowState, selection } from '@/components/organisms/table/table.styles';
import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';
import { cn } from '@/lib/utils';

/**
 * Compact Noir Ion D specimen (JOV-4648).
 *
 * Renders shell-scoped workspace states only: table row hover/selected/focus,
 * PageToolbar surfaces, overlay elevation, and reserved skeleton geometry.
 * Mount under `[data-app-shell-frame="true"]` so token rebinds apply.
 */
export function NoirIonWorkspaceStatesSpecimen() {
  return (
    <div
      data-app-shell-frame='true'
      data-testid='noir-ion-workspace-states-specimen'
      className='flex max-w-xl flex-col gap-3 bg-(--app-shell-content-surface) p-3 text-primary-token'
    >
      <PageToolbar
        start={
          <>
            <PageToolbarTabButton label='All' active />
            <PageToolbarTabButton label='Drafts' />
            <span className='text-xs text-tertiary-token tabular-nums'>
              12 rows
            </span>
          </>
        }
        end={
          <PageToolbarActionButton
            label='Display'
            ariaLabel='Display options'
          />
        }
      />

      <table
        data-testid='noir-ion-specimen-table'
        className='w-full overflow-hidden rounded-lg border border-subtle'
        aria-label='Workspace State Specimen'
      >
        <tbody>
          <tr
            className={cn(
              'system-b-table-row-height system-b-table-row-shell',
              rowState.base,
              rowState.hover,
              selection.unchecked
            )}
            data-state='default'
          >
            <td className='px-3 text-app font-caption'>Default row</td>
          </tr>
          <tr
            className={cn(
              'system-b-table-row-height system-b-table-row-shell',
              rowState.base,
              rowState.selected,
              selection.selected
            )}
            data-state='selected'
          >
            <td className='px-3 text-app font-caption'>Selected row</td>
          </tr>
          <tr
            className={cn(
              'system-b-table-row-height system-b-table-row-shell',
              rowState.base,
              rowState.focused,
              rowState.focusVisible
            )}
            data-state='focused'
            tabIndex={0}
          >
            <td className='px-3 text-app font-caption'>Focused row</td>
          </tr>
          <tr
            className='system-b-table-row-height system-b-table-row-shell'
            data-state='loading'
            aria-busy='true'
          >
            <td className='flex items-center gap-2 px-3'>
              <span
                className='skeleton h-4 w-24 rounded motion-reduce:animate-none'
                data-testid='noir-ion-specimen-skeleton'
              />
              <span className='skeleton h-4 w-16 rounded motion-reduce:animate-none' />
            </td>
          </tr>
        </tbody>
      </table>

      <div className='flex flex-wrap items-start gap-2'>
        <div
          data-testid='noir-ion-specimen-popover'
          className={cn(LINEAR_SURFACE.popover, 'min-w-40 p-2')}
        >
          <p className='text-xs text-secondary-token'>Popover elevation</p>
        </div>
        <div
          data-testid='noir-ion-specimen-tooltip'
          className='rounded-full border border-default bg-surface-tooltip px-2 py-1 text-xs text-primary-token shadow-popover'
        >
          Compact tooltip
        </div>
        <div
          data-testid='noir-ion-specimen-drawer-card'
          className={cn(LINEAR_SURFACE.drawerCard, 'min-w-40 p-2')}
        >
          <p className='text-xs text-secondary-token'>Drawer card</p>
        </div>
      </div>

      {/* Class contracts for static tests — not rendered UI chrome. */}
      <span className='sr-only' data-testid='noir-ion-specimen-contracts'>
        {[
          PAGE_TOOLBAR_TAB_BUTTON_CLASS,
          PAGE_TOOLBAR_TAB_ACTIVE_CLASS,
          PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
          rowState.hover,
          rowState.selected,
          rowState.focusVisible,
        ].join(' ')}
      </span>
    </div>
  );
}
