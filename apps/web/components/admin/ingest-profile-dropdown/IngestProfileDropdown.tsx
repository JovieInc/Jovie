'use client';

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui';
import { useRef } from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { IngestProfileDropdownProps } from './types';
import { useIngestProfile } from './useIngestProfile';

export function IngestProfileDropdown({
  onIngestPending,
}: Readonly<IngestProfileDropdownProps>) {
  const {
    open,
    setOpen,
    url,
    setUrl,
    isLoading,
    isSuccess,
    detectedPlatform,
    handleSubmit,
  } = useIngestProfile({ onIngestPending });
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type='button' size='sm' variant='ghost'>
          <Icon name='Plus' className='h-3.5 w-3.5' />
          Ingest Profile
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='w-72 p-3'
        onOpenAutoFocus={e => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <form onSubmit={handleSubmit} className='space-y-3'>
          <div className='flex items-center gap-2'>
            <Icon
              name='UserPlus'
              className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
              aria-hidden='true'
            />
            <span className='text-xs font-medium text-primary-token'>
              Ingest social profile
            </span>
          </div>

          {isSuccess && (
            <div className='rounded-md border border-success/20 bg-success/10 px-3 py-2 text-xs text-success'>
              Profile created — refreshing table…
            </div>
          )}

          <Input
            ref={inputRef}
            type='url'
            inputSize='sm'
            placeholder='https://instagram.com/username'
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={isLoading}
            autoComplete='off'
            className='text-xs'
          />

          {detectedPlatform && (
            <div className='flex items-center gap-2 text-xs text-secondary-token'>
              <span
                className='h-2 w-2 shrink-0 rounded-full'
                style={{ backgroundColor: `#${detectedPlatform.color}` }}
                aria-hidden='true'
              />
              <span>Detected: {detectedPlatform.name}</span>
            </div>
          )}

          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => setOpen(false)}
              disabled={isLoading}
              className='text-xs'
            >
              Cancel
            </Button>
            <Button
              type='submit'
              variant='primary'
              size='sm'
              disabled={isLoading || !url.trim()}
              className='text-xs'
            >
              {isLoading ? 'Ingesting…' : 'Ingest'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
