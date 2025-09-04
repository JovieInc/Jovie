import React, { type ReactNode } from 'react';

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
}: SetupTaskItemProps): JSX.Element {
  return (
    <li className='flex items-center gap-3 p-3 rounded-lg border border-subtle'>
      <div className='flex-shrink-0'>
        <div
          className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${
            complete ? 'bg-accent border-accent' : 'border-surface-3'
          }`}
        >
          {complete && (
            <svg
              className='w-3 h-3 text-white'
              fill='currentColor'
              viewBox='0 0 20 20'
              aria-hidden='true'
            >
              <path
                fillRule='evenodd'
                d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                clipRule='evenodd'
              />
            </svg>
          )}
        </div>
      </div>
      <div className='flex-1'>
        <p className='text-sm font-medium text-primary-token'>
          {index}. {title}
        </p>
        <p className='text-xs text-secondary-token'>
          {complete ? completeLabel : incompleteLabel}
        </p>
      </div>
      {!complete && action}
    </li>
  );
}
