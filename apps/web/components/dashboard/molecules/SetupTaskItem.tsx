import { type ReactNode } from 'react';

export interface SetupTaskItemProps {
  index: number;
  title: string;
  complete: boolean;
  completeLabel: string;
  incompleteLabel: string;
  action?: ReactNode;
}

export function SetupTaskItem({
  index,
  title,
  complete,
  completeLabel,
  incompleteLabel,
  action,
}: SetupTaskItemProps): React.ReactElement {
  return (
    <li className='flex h-full flex-col gap-3 rounded-xl border border-subtle bg-surface-1/70 p-4 shadow-sm'>
      <div className='flex items-center gap-2'>
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            complete
              ? 'bg-surface-1 text-secondary-token ring-1 ring-inset ring-subtle'
              : 'bg-accent/15 text-accent ring-1 ring-inset ring-interactive/20'
          }`}
          aria-hidden='true'
        >
          {complete ? '✓' : index}
        </div>
        <p className='truncate text-sm font-semibold text-primary-token'>
          {title}
        </p>
      </div>
      <span className='truncate text-[13px] leading-relaxed text-secondary-token'>
        {complete ? completeLabel : incompleteLabel}
      </span>
      {!complete && action ? (
        <div className='mt-auto flex shrink-0 [&_a]:min-h-[44px] [&_a]:flex [&_a]:items-center [&_button]:min-h-[44px]'>
          {action}
        </div>
      ) : null}
    </li>
  );
}
