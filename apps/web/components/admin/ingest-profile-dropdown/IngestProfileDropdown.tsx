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
import { PLATFORM_OPTIONS } from './constants';
import type { IngestProfileDropdownProps } from './types';
import { useIngestProfile } from './useIngestProfile';

export function IngestProfileDropdown({
  onIngestPending,
}: IngestProfileDropdownProps) {
  const {
    open,
    setOpen,
    username,
    setUsername,
    urlOverride,
    setUrlOverride,
    selectedPlatform,
    setSelectedPlatform,
    isLoading,
    isSuccess,
    currentPlatform,
    effectiveUrl,
    handleSubmit,
  } = useIngestProfile({ onIngestPending });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type='button' size='sm' variant='secondary'>
          <Icon name='Plus' className='h-4 w-4 mr-2' />
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
                Import from external platform (auto-builds URL)
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

          {/* Platform selector */}
          <div className='flex gap-1'>
            {PLATFORM_OPTIONS.map(platform => (
              <button
                key={platform.id}
                type='button'
                disabled={!platform.enabled}
                onClick={() => setSelectedPlatform(platform.id)}
                className={`
                  px-3 py-1.5 text-xs font-medium rounded-full transition-colors
                  ${
                    selectedPlatform === platform.id
                      ? 'bg-primary text-primary-foreground'
                      : platform.enabled
                        ? 'bg-surface-2 text-secondary-token hover:bg-surface-3'
                        : 'bg-surface-2/50 text-tertiary-token cursor-not-allowed opacity-50'
                  }
                `}
              >
                {platform.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className='space-y-3'>
            {isSuccess && (
              <div className='rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-800/60 dark:bg-green-950/30 dark:text-green-200'>
                Profile created — refreshing table…
              </div>
            )}

            <div className='space-y-1'>
              <Input
                type='text'
                placeholder='username'
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setUrlOverride(null);
                }}
                disabled={isLoading}
                autoFocus
                className='w-full'
              />
              <p className='text-xs text-secondary-token'>
                {currentPlatform?.label} URL:{' '}
                <span className='font-sans'>{effectiveUrl || '—'}</span>
              </p>
            </div>

            <div className='space-y-1'>
              {
                // biome-ignore lint/a11y/noLabelWithoutControl: Label is associated with control via DOM structure
                <label className='text-xs text-secondary-token'>
                  Or paste full URL
                </label>
              }
              <Input
                type='url'
                placeholder={currentPlatform?.placeholder}
                value={urlOverride ?? ''}
                onChange={e => setUrlOverride(e.target.value || null)}
                disabled={isLoading}
                className='w-full'
              />
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
                disabled={isLoading || !effectiveUrl}
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
