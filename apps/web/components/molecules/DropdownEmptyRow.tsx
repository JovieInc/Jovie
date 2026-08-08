'use client';

export interface DropdownEmptyRowProps {
  readonly message: string;
}

/**
 * Menu-row style empty note for dropdown lists. This is NOT a canonical empty
 * state — the `EmptyState` molecule owns hierarchy empty states.
 */
export function DropdownEmptyRow({ message }: Readonly<DropdownEmptyRowProps>) {
  return (
    <div className='px-1.5 py-1.5'>
      <div className='flex min-h-17 items-center rounded-md bg-surface-1 px-2.5'>
        <p className='text-xs leading-[17px] text-secondary-token'>{message}</p>
      </div>
    </div>
  );
}
