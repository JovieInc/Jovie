'use client';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import type { ReactNode } from 'react';

/** Keep issue collections within the row budget, with the full list one activation away. */
export function TableIssueSummary({
  issues,
}: {
  readonly issues: ReadonlyArray<{
    readonly label: string;
    readonly icon?: ReactNode;
  }>;
}) {
  if (issues.length === 0)
    return <span className='text-2xs text-tertiary-token'>—</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className='max-w-full'
          aria-label={`View ${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`}
          onClick={event => event.stopPropagation()}
        >
          {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' aria-label='Issues' className='w-64'>
        <ul className='space-y-2 p-2 text-xs'>
          {issues.map(issue => (
            <li key={issue.label} className='flex items-start gap-2 text-error'>
              {issue.icon}
              {issue.label}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
