'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ChatMarkdown } from '@/components/jovie/components/ChatMarkdown';
import { cn } from '@/lib/utils';

interface SkillDocCardProps {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly model: string;
  readonly version: string;
  readonly promptContent: string | null;
}

export function SkillDocCard({
  id,
  name,
  description,
  kind,
  model,
  version,
  promptContent,
}: SkillDocCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className='rounded-lg border border-subtle bg-surface-1'
      data-testid={`skill-card-${id}`}
    >
      <button
        type='button'
        className='flex w-full items-start gap-3 p-4 text-left'
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
      >
        <span className='mt-0.5 shrink-0 text-secondary-token'>
          {open ? (
            <ChevronDown className='h-4 w-4' />
          ) : (
            <ChevronRight className='h-4 w-4' />
          )}
        </span>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-sm font-medium text-primary-token'>
              {name}
            </span>
            <span className='rounded-sm bg-surface-0 px-1.5 py-0.5 font-mono text-3xs text-secondary-token'>
              {kind}
            </span>
            <span className='rounded-sm bg-surface-0 px-1.5 py-0.5 font-mono text-3xs text-tertiary-token'>
              v{version}
            </span>
          </div>
          <p className='mt-1 text-xs text-secondary-token'>{description}</p>
          <p className='mt-0.5 font-mono text-2xs text-tertiary-token'>
            {model}
          </p>
        </div>
      </button>

      {open && promptContent ? (
        <div
          className={cn(
            'border-t border-subtle px-4 pb-4 pt-3',
            'overflow-x-auto'
          )}
        >
          <ChatMarkdown content={promptContent} />
        </div>
      ) : null}

      {open && !promptContent ? (
        <div className='border-t border-subtle px-4 pb-4 pt-3'>
          <p className='text-xs text-tertiary-token'>
            No prompt doc for this skill.
          </p>
        </div>
      ) : null}
    </div>
  );
}
