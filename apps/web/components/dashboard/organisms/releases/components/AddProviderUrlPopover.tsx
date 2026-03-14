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
          className='group/add h-7 min-w-[76px] gap-1.5 rounded-[7px] px-2.5 text-[11px] font-[450] text-(--linear-text-tertiary)'
        >
          <Icon
            name='Plus'
            className='h-3.5 w-3.5 opacity-0 transition-opacity group-hover/add:opacity-100 group-focus-visible/add:opacity-100'
            aria-hidden='true'
          />
          <span className='line-clamp-1 text-(--linear-text-tertiary) group-hover/add:hidden group-focus-visible/add:hidden'>
            —
          </span>
          <span className='line-clamp-1 hidden group-hover/add:inline group-focus-visible/add:inline'>
            Add link
          </span>
        </DrawerButton>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-[288px] border-0 bg-transparent p-0 shadow-none'
        onOpenAutoFocus={e => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DrawerSurfaceCard className='p-3'>
          <form onSubmit={handleSubmit} className='space-y-3'>
            <div className='flex items-center gap-2'>
              <span
                className='h-2 w-2 shrink-0 rounded-full'
                style={{ backgroundColor: accent }}
                aria-hidden='true'
              />
              <span className='text-[13px] font-[510] text-(--linear-text-primary)'>
                Add {providerLabel} link
              </span>
            </div>
            <DrawerFormField
              label='URL'
              helperText={
                validationError ? (
                  <span className='text-(--linear-error)'>
                    {validationError}
                  </span>
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
                className='h-8 rounded-[8px] border-(--linear-border-subtle) bg-(--linear-bg-surface-1) text-[12px]'
              />
            </DrawerFormField>
            <div className='flex justify-end gap-2'>
              <DrawerButton
                type='button'
                tone='ghost'
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
                className='min-w-[68px]'
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
