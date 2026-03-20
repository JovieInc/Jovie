'use client';

export interface DropdownEmptyStateProps {
  readonly message: string;
}

export function DropdownEmptyState({
  message,
}: Readonly<DropdownEmptyStateProps>) {
  return (
    <div className='px-1.5 py-1.5'>
      <div className='flex min-h-[68px] items-center rounded-md bg-surface-1 px-2.5'>
        <p className='text-[12px] leading-[17px] text-secondary-token'>
          {message}
        </p>
      </div>
    </div>
  );
}
