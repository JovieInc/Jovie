import React, { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl transition-all duration-300 ease-out',
        'ring-1 ring-border-subtle backdrop-blur-sm',
        'hover:ring-border-default hover:shadow-floating hover:-translate-y-0.5',
        'active:translate-y-0 active:shadow-default',
        complete
          ? 'bg-status-success/5 ring-status-success/20 shadow-subtle'
          : 'bg-surface-elevated/80 shadow-default hover:bg-surface-elevated'
      )}
    >
      {/* Sophisticated background gradient */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-300',
          complete
            ? 'bg-gradient-to-r from-status-success/5 via-transparent to-status-success/3 opacity-100'
            : 'bg-gradient-to-r from-surface-elevated/60 via-transparent to-surface-elevated/30 opacity-0 group-hover:opacity-100'
        )}
      />

      {/* Content container */}
      <div className='relative flex items-center gap-4 p-5'>
        {/* Enhanced status indicator */}
        <div className='flex-shrink-0'>
          <div
            className={cn(
              'relative h-9 w-9 rounded-full flex items-center justify-center transition-all duration-300 ease-out',
              'ring-2 ring-offset-2 ring-offset-surface-base',
              complete
                ? 'bg-status-success ring-status-success/30 shadow-lg shadow-status-success/20 scale-105'
                : 'bg-surface-2 ring-border-subtle group-hover:ring-border-default group-hover:scale-105 group-hover:shadow-md'
            )}
          >
            {/* Glow effect for completed state */}
            {complete && (
              <div className='absolute inset-0 rounded-full bg-status-success animate-pulse opacity-20' />
            )}

            {complete ? (
              <svg
                className='w-4 h-4 text-white relative z-10 transition-transform duration-200 group-hover:scale-110'
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
              <span className='text-sm font-bold text-text-secondary transition-colors duration-200 group-hover:text-text-primary'>
                {index}
              </span>
            )}
          </div>
        </div>

        {/* Enhanced content section */}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-3 mb-1.5'>
            <h3
              className={cn(
                'text-sm font-semibold transition-all duration-200',
                complete
                  ? 'text-status-success'
                  : 'text-text-primary group-hover:text-text-primary'
              )}
            >
              {title}
            </h3>
            {complete && (
              <div className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-success/10 ring-1 ring-status-success/20 backdrop-blur-sm'>
                <div className='w-1.5 h-1.5 rounded-full bg-status-success animate-pulse' />
                <span className='text-[10px] font-bold text-status-success uppercase tracking-wider'>
                  Complete
                </span>
              </div>
            )}
          </div>
          <p
            className={cn(
              'text-xs leading-relaxed transition-colors duration-200',
              complete
                ? 'text-status-success/70'
                : 'text-text-muted group-hover:text-text-secondary'
            )}
          >
            {complete ? completeLabel : incompleteLabel}
          </p>
        </div>

        {/* Enhanced action section */}
        {!complete && action && (
          <div className='flex-shrink-0 opacity-90 group-hover:opacity-100 transition-opacity duration-200'>
            {action}
          </div>
        )}
      </div>

      {/* Subtle shine effect on hover */}
      <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700 ease-out' />
    </div>
  );
}
