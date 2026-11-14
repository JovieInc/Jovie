'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { ChevronDown } from 'lucide-react';
import {
  PAGE_TOOLBAR_TAB_BUTTON_CLASS,
  PageToolbarTabButton,
} from '@/components/organisms/table';
import {
  OUTBOUND_VIEW_LABELS,
  OUTBOUND_VIEWS,
  type OutboundQueue,
  type OutboundView,
} from '@/lib/outbound/types';

const REVIEW_VIEWS: readonly OutboundView[] = [
  'ready',
  'needs_evidence',
  'flagged',
];

export function OutboundViews({
  view,
  counts,
  onViewChange,
}: Readonly<{
  view: OutboundView;
  counts?: OutboundQueue['counts'];
  onViewChange: (view: OutboundView) => void;
}>) {
  const label = (option: OutboundView) =>
    `${OUTBOUND_VIEW_LABELS[option]}${counts ? ` ${counts[option]}` : ''}`;

  return (
    <div className='@container min-w-0 flex-1'>
      <div
        className='flex items-center gap-0.5'
        role='toolbar'
        aria-label='Outbound Views'
      >
        <div className='hidden items-center gap-0.5 @lg:flex'>
          {REVIEW_VIEWS.map(option => (
            <PageToolbarTabButton
              key={option}
              active={view === option}
              onClick={() => onViewChange(option)}
              label={<span className='tabular-nums'>{label(option)}</span>}
            />
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size='sm'
              variant='ghost'
              className={PAGE_TOOLBAR_TAB_BUTTON_CLASS}
              aria-label={`All Outbound views, current: ${label(view)}`}
            >
              <span className='tabular-nums @lg:hidden'>{label(view)}</span>
              <span className='hidden tabular-nums @lg:inline'>
                {REVIEW_VIEWS.includes(view) ? 'More' : label(view)}
              </span>
              <ChevronDown aria-hidden='true' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuRadioGroup
              value={view}
              onValueChange={value => onViewChange(value as OutboundView)}
            >
              {OUTBOUND_VIEWS.map(option => (
                <DropdownMenuRadioItem
                  key={option}
                  value={option}
                  aria-label={label(option)}
                >
                  <span className='flex w-full items-center justify-between gap-4'>
                    {OUTBOUND_VIEW_LABELS[option]}
                    <span className='tabular-nums text-tertiary-token'>
                      {counts?.[option]}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
