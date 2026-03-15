'use client';

export interface DropdownEmptyStateProps {
  readonly message: string;
}

export function DropdownEmptyState({
  message,
}: Readonly<DropdownEmptyStateProps>) {
  return (
    <div className='px-2 py-2'>
      <div className='flex min-h-[76px] items-center rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3'>
        <p className='text-[12px] leading-[17px] text-(--linear-text-secondary)'>
          {message}
        </p>
      </div>
    </div>
  );
}
