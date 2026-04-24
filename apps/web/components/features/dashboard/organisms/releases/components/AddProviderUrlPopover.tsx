'use client';

import { Input, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  DrawerButton,
  DrawerFormField,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { PROVIDER_DOMAINS } from '@/lib/discography/provider-domains';
import type { ProviderKey } from '@/lib/discography/types';

export interface AddProviderUrlPopoverProps {
  readonly providerLabel: string;
  readonly accent: string;
  readonly providerKey?: ProviderKey;
  readonly onSave: (url: string) => Promise<void>;
  readonly isSaving?: boolean;
}

export function AddProviderUrlPopover({
  providerLabel,
  accent,
  providerKey,
  onSave,
  isSaving,
}: Readonly<AddProviderUrlPopoverProps>) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [validationError, setValidationError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isSavingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    if (providerKey) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmed);
      } catch {
        setValidationError('Please enter a valid URL');
        return;
      }

      const allowedDomains = PROVIDER_DOMAINS[providerKey];
      const hostname = parsedUrl.hostname.toLowerCase();
      const isValidDomain = allowedDomains.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      );

      if (!isValidDomain) {
        const domainMsg =
          allowedDomains.length === 1
            ? allowedDomains[0]
            : `one of: ${allowedDomains.join(', ')}`;
        setValidationError(`URL must be from ${domainMsg}`);
        return;
      }
    }

    setValidationError('');
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      await onSave(trimmed);
      setUrl('');
      setOpen(false);
    } catch {
      // Error toast is shown by the hook; keep popover open so user can retry
    } finally {
      isSavingRef.current = false;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <DrawerButton
          aria-label={`Add ${providerLabel} link`}
          tone='ghost'
          size='sm'
          className='group/add h-6.5 min-w-[68px] gap-1 rounded-full px-2 text-2xs font-caption text-tertiary-token'
        >
          <Icon name='Plus' className='h-3.5 w-3.5' aria-hidden='true' />
          <span className='line-clamp-1'>Add</span>
        </DrawerButton>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-[280px] rounded-xl border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-0 shadow-popover'
        onOpenAutoFocus={e => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DrawerSurfaceCard
          variant='card'
          className='rounded-xl border-0 bg-transparent p-2.5'
        >
          <form onSubmit={handleSubmit} className='space-y-2.5'>
            <div className='flex items-center gap-2'>
              <span
                className='h-2 w-2 shrink-0 rounded-full'
                style={{ backgroundColor: accent }}
                aria-hidden='true'
              />
              <span className='text-app font-caption text-primary-token'>
                Add {providerLabel} link
              </span>
            </div>
            <DrawerFormField
              label='URL'
              helperText={
                validationError ? (
                  <span className='text-error'>{validationError}</span>
                ) : undefined
              }
              className='space-y-2'
            >
              <Input
                ref={inputRef}
                type='url'
                inputSize='sm'
                placeholder='Paste URL here...'
                value={url}
                onChange={e => {
                  setUrl(e.target.value);
                  setValidationError('');
                }}
                disabled={isSaving}
                autoComplete='off'
                className='h-8 rounded-full border-subtle bg-surface-1 text-xs'
              />
            </DrawerFormField>
            <div className='flex justify-end gap-2'>
              <DrawerButton
                type='button'
                tone='ghost'
                className='h-7 rounded-full px-2.5 text-2xs'
                onClick={() => {
                  setUrl('');
                  setOpen(false);
                }}
              >
                Cancel
              </DrawerButton>
              <DrawerButton
                type='submit'
                tone='primary'
                disabled={!url.trim() || isSaving}
                className='h-7 min-w-[60px] rounded-full px-2.5 text-2xs'
              >
                {isSaving ? 'Saving...' : 'Save'}
              </DrawerButton>
            </div>
          </form>
        </DrawerSurfaceCard>
      </PopoverContent>
    </Popover>
  );
}
