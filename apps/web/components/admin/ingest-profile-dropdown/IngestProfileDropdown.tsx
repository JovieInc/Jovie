'use client';

import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui';
import { Icon } from '@/components/atoms/Icon';
import type { IngestProfileDropdownProps } from './types';
import { useIngestProfile } from './useIngestProfile';

export function IngestProfileDropdown({
  onIngestPending,
}: IngestProfileDropdownProps) {
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          className='gap-2 rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
        >
          <Icon name='Plus' className='h-4 w-4' />
          Ingest Profile
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-0'>
        <div className='p-4 space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-sm font-semibold text-primary-token'>
                Ingest profile
              </p>
              <p className='text-xs text-secondary-token'>
                Paste any social profile URL
              </p>
            </div>
            <Badge
              variant='secondary'
              size='sm'
              className='uppercase text-[10px]'
            >
              Admin
            </Badge>
          </div>

          <form onSubmit={handleSubmit} className='space-y-3'>
            {isSuccess && (
              <div className='rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-800/60 dark:bg-green-950/30 dark:text-green-200'>
                Profile created — refreshing table…
              </div>
            )}

            <div className='space-y-2'>
              <Input
                type='text'
                placeholder='https://instagram.com/username'
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={isLoading}
                autoFocus
                className='w-full'
              />
              {detectedPlatform && (
                <div className='flex items-center gap-2 text-xs text-secondary-token'>
                  <div
                    className='w-3 h-3 rounded-full'
                    style={{ backgroundColor: `#${detectedPlatform.color}` }}
                  />
                  <span>Detected: {detectedPlatform.name}</span>
                </div>
              )}
              <p className='text-xs text-tertiary-token'>
                Supports Instagram, TikTok, Twitter/X, YouTube, Spotify,
                Linktree, and 40+ more platforms
              </p>
            </div>

            <div className='flex justify-end gap-2'>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                size='sm'
                variant='primary'
                disabled={isLoading || !url.trim()}
              >
                {isLoading ? 'Ingesting...' : 'Ingest'}
              </Button>
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
