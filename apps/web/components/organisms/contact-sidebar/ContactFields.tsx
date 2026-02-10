'use client';

import { Input, Label } from '@jovie/ui';
import React, { memo } from 'react';

import { formatUsername } from './utils';

interface ContactFieldsProps {
  readonly firstName: string | null | undefined;
  readonly lastName: string | null | undefined;
  readonly username: string;
  readonly onNameChange: (
    field: 'firstName' | 'lastName',
    value: string
  ) => void;
  readonly onUsernameChange: (value: string) => void;
}

export const ContactFields = memo(function ContactFields({
  firstName,
  lastName,
  username,
  onNameChange,
  onUsernameChange,
}: ContactFieldsProps) {
  return (
    <div className='space-y-3'>
      {/* Name field */}
      <div className='grid grid-cols-[96px,minmax(0,1fr)] items-start gap-2'>
        <Label className='text-xs text-secondary-token pt-2'>Name</Label>
        <div className='grid grid-cols-2 gap-2 min-w-0'>
          <div className='min-w-0'>
            <Label className='sr-only'>First name</Label>
            <Input
              value={firstName ?? ''}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onNameChange('firstName', event.target.value)
              }
              placeholder='First'
            />
          </div>
          <div className='min-w-0'>
            <Label className='sr-only'>Last name</Label>
            <Input
              value={lastName ?? ''}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onNameChange('lastName', event.target.value)
              }
              placeholder='Last'
            />
          </div>
        </div>
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
