'use client';

/**
 * ContactFields Component
 *
 * Editable/readonly fields for contact name and username
 */

import { Input, Label } from '@jovie/ui';
import React from 'react';

import { formatUsername } from './utils';

interface ContactFieldsProps {
  firstName: string | null;
  lastName: string | null;
  username: string;
  isEditable: boolean;
  onNameChange: (field: 'firstName' | 'lastName', value: string) => void;
  onUsernameChange: (value: string) => void;
}

export function ContactFields({
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
      <div className='grid grid-cols-[96px,minmax(0,1fr)] items-start gap-2'>
        <Label className='text-xs text-sidebar-muted pt-2'>Name</Label>
        {isEditable ? (
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
        ) : (
          <div className='min-h-9 flex items-center text-sm'>
            {firstName || lastName ? (
              <span>{[firstName, lastName].filter(Boolean).join(' ')}</span>
            ) : (
              <span className='text-sidebar-muted italic'>Not provided</span>
            )}
          </div>
        )}
      </div>

      {/* Username field */}
      <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
        <Label className='text-xs text-sidebar-muted'>Username</Label>
        {isEditable ? (
          <Input
            value={formatUsername(username)}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              onUsernameChange(event.target.value)
            }
            placeholder='@username'
          />
        ) : (
          <div className='min-h-9 flex items-center text-sm'>
            {username ? (
              <span>{formatUsername(username)}</span>
            ) : (
              <span className='text-sidebar-muted italic'>Not provided</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
