'use client';

/**
 * ContactFields Component
 *
 * Editable/readonly fields for contact name and username
 */

import { Input, Label } from '@jovie/ui';
import React, { memo } from 'react';

import { DrawerPropertyRow } from '@/components/molecules/drawer';

import { formatUsername } from './utils';

interface ContactFieldsProps {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  username: string;
  isEditable: boolean;
  onNameChange: (field: 'firstName' | 'lastName', value: string) => void;
  onUsernameChange: (value: string) => void;
}

export const ContactFields = memo(function ContactFields({
  firstName,
  lastName,
  username,
  isEditable,
  onNameChange,
  onUsernameChange,
}: ContactFieldsProps) {
  return (
    <div className='space-y-3'>
      {/* Name field */}
      {isEditable ? (
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
      ) : (
        <DrawerPropertyRow
          label='Name'
          value={
            firstName || lastName ? (
              [firstName, lastName].filter(Boolean).join(' ')
            ) : (
              <span className='text-secondary-token italic'>Not provided</span>
            )
          }
        />
      )}

      {/* Username field */}
      {isEditable ? (
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
      ) : (
        <DrawerPropertyRow
          label='Username'
          value={
            username ? (
              formatUsername(username)
            ) : (
              <span className='text-secondary-token italic'>Not provided</span>
            )
          }
        />
      )}
    </div>
  );
});
