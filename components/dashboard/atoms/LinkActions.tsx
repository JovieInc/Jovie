'use client';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

interface LinkActionsProps {
  onToggle: () => void;
  onRemove: () => void;
  isVisible: boolean;
  showDragHandle?: boolean;
  onDragHandlePointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  className?: string;
}

export function LinkActions({
  onToggle,
  onRemove,
  isVisible,
  showDragHandle = true,
  onDragHandlePointerDown,
  className,
}: LinkActionsProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size='icon'
            variant='ghost'
            className='h-7 w-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity'
            onClick={onToggle}
            aria-label={isVisible ? 'Hide link' : 'Show link'}
          >
            {isVisible ? (
              <Icon name='Eye' className='h-3.5 w-3.5' />
            ) : (
              <Icon name='EyeOff' className='h-3.5 w-3.5' />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>
          {isVisible ? 'Hide link' : 'Show link'}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size='icon'
            variant='ghost'
            className='h-7 w-7 text-destructive/70 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity'
            onClick={onRemove}
            aria-label='Remove link'
          >
            <Icon name='Trash2' className='h-3.5 w-3.5' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>Remove link</TooltipContent>
      </Tooltip>

      {showDragHandle && (
        <button
          type='button'
          className='h-7 w-5 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none'
          onPointerDown={onDragHandlePointerDown}
          aria-label='Drag handle'
        >
          <Icon name='GripVertical' className='h-4 w-4' />
        </button>
      )}
    </div>
  );
}
