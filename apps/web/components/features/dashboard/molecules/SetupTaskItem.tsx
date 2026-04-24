import { type ReactNode } from 'react';

export interface SetupTaskItemProps {
  readonly index: number;
  readonly title: string;
  readonly complete: boolean;
  readonly completeLabel: string;
  readonly incompleteLabel: string;
  readonly action?: ReactNode;
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
    <li className='flex h-full flex-col gap-3 rounded-xl border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-4 shadow-none'>
      <div className='flex items-center gap-2'>
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-[510] ${
            complete
              ? 'border border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token'
              : 'border border-accent/20 bg-accent/10 text-accent'
          }`}
          aria-hidden='true'
        >
          {complete ? '✓' : index}
        </div>
        <p className='truncate text-[13px] font-semibold text-primary-token'>
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
