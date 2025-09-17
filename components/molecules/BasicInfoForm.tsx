'use client';

import { Button } from '@jovie/ui';
import * as React from 'react';
import { SettingsInput } from '@/components/atoms/SettingsInput';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';

interface BasicInfoFormProps {
  username: string;
  displayName: string;
  appDomain: string;
  isLoading?: boolean;
  onUsernameChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  className?: string;
}

export function BasicInfoForm({
  username,
  displayName,
  appDomain,
  isLoading = false,
  onUsernameChange,
  onDisplayNameChange,
  onSubmit,
  className,
}: BasicInfoFormProps) {
  return (
    <form onSubmit={onSubmit} className={className}>
      <DashboardCard variant='settings'>
        <h3 className='text-lg font-medium text-primary mb-6'>
          Basic Information
        </h3>

        <div className='space-y-6'>
          <SettingsInput
            label='Username'
            value={username}
            onChange={e => onUsernameChange(e.target.value)}
            prefix={`${appDomain}/`}
            placeholder='yourname'
            required
          />

          <SettingsInput
            label='Display Name'
            description='The name your fans will see'
            value={displayName}
            onChange={e => onDisplayNameChange(e.target.value)}
            placeholder='The name your fans will see'
            required
          />
        </div>
      </DashboardCard>

      <div className='flex justify-end pt-6'>
        <Button
          type='submit'
          disabled={isLoading}
          variant='primary'
          className='px-6 py-2.5'
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
