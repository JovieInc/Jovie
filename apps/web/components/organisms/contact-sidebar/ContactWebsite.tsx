'use client';

import { Input, Label } from '@jovie/ui';
import { Globe } from 'lucide-react';
import React, { memo } from 'react';

interface ContactWebsiteProps {
  readonly website: string | null | undefined;
  readonly onWebsiteChange: (value: string) => void;
}

export const ContactWebsite = memo(function ContactWebsite({
  website,
  onWebsiteChange,
}: ContactWebsiteProps) {
  return (
    <div className='space-y-2 p-3'>
      <Label className='text-xs text-sidebar-muted flex items-center gap-1.5'>
        <Globe className='h-3.5 w-3.5' />
        Website
      </Label>
      <Input
        type='url'
        value={website ?? ''}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          onWebsiteChange(event.target.value)
        }
        placeholder='https://example.com'
        inputMode='url'
        autoCapitalize='none'
        autoCorrect='off'
      />
      <p className='text-[11px] text-tertiary-token'>
        One website per artist.
      </p>
    </div>
  );
});
