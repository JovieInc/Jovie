'use client';

import { Input, Label } from '@jovie/ui';
import React, { memo } from 'react';

import { formatUsername } from './utils';

interface ContactFieldsProps {
  readonly name: string;
  readonly username: string;
  readonly onNameChange: (value: string) => void;
  readonly onUsernameChange: (value: string) => void;
}

export const ContactFields = memo(function ContactFields({
  name,
  username,
  onNameChange,
  onUsernameChange,
}: ContactFieldsProps) {
  return (
    <div className='space-y-3'>
      {/* Name field */}
      <div className='grid grid-cols-[96px,minmax(0,1fr)] items-start gap-2'>
        <Label className='text-xs text-secondary-token pt-2'>Name</Label>
        <Input
          value={name}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onNameChange(event.target.value)
          }
          placeholder='Full name'
        />
      </div>

      {/* Username field */}
      <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
        <Label className='text-xs text-secondary-token'>Username</Label>
        <Input
          value={formatUsername(username)}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onUsernameChange(event.target.value)
          }
          placeholder='@username'
        />
      </div>
    </div>
  );
});
