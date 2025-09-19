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
    <li
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${
        complete
          ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className='flex-shrink-0'>
        <div
          className={`h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
            complete
              ? 'bg-green-500 border-green-500 shadow-lg shadow-green-200 dark:shadow-green-900/30'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
          }`}
        >
          {complete ? (
            <svg
              className='w-4 h-4 text-white animate-pulse'
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
          ) : (
            <span className='text-sm font-semibold text-gray-400 dark:text-gray-500'>
              {index}
            </span>
          )}
        </div>
      </div>
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-2 mb-1'>
          <p
            className={`text-sm font-semibold transition-colors ${
              complete
                ? 'text-green-700 dark:text-green-300'
                : 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {title}
          </p>
          {complete && (
            <span className='inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300'>
              ✓ Complete
            </span>
          )}
        </div>
        <p
          className={`text-xs transition-colors ${
            complete
              ? 'text-green-600 dark:text-green-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {complete ? completeLabel : incompleteLabel}
        </p>
      </div>
      {!complete && action && <div className='flex-shrink-0'>{action}</div>}
    </li>
  );
}
