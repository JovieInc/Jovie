'use client';

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui';
import { useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';

export interface AddProviderUrlPopoverProps {
  readonly providerLabel: string;
  readonly accent: string;
  readonly onSave: (url: string) => Promise<void>;
  readonly isSaving?: boolean;
}

export function AddProviderUrlPopover({
  providerLabel,
  accent,
  onSave,
  isSaving,
}: Readonly<AddProviderUrlPopoverProps>) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      await onSave(trimmed);
      setUrl('');
      setOpen(false);
    } catch {
      // Error toast is shown by the hook; keep popover open so user can retry
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          className='group/add inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
        >
          <Icon
            name='Plus'
            className='h-3.5 w-3.5 opacity-0 transition-opacity group-hover/add:opacity-100'
            aria-hidden='true'
          />
          <span className='line-clamp-1 text-tertiary-token/50 group-hover/add:hidden'>
            —
          </span>
          <span className='line-clamp-1 hidden group-hover/add:inline'>
            Add link
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-72 p-3'
        onOpenAutoFocus={e => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <form onSubmit={handleSubmit} className='space-y-3'>
          <div className='flex items-center gap-2'>
            <span
              className='h-2 w-2 shrink-0 rounded-full'
              style={{ backgroundColor: accent }}
              aria-hidden='true'
            />
            <span className='text-xs font-medium text-primary-token'>
              Add {providerLabel} link
            </span>
          </div>
          <Input
            ref={inputRef}
            type='url'
            inputSize='sm'
            placeholder='Paste URL here...'
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={isSaving}
            autoComplete='off'
            className='text-xs'
          />
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => {
                setUrl('');
                setOpen(false);
              }}
              className='text-xs'
            >
              Cancel
            </Button>
            <Button
              type='submit'
              variant='primary'
              size='sm'
              disabled={!url.trim() || isSaving}
              className='text-xs'
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
