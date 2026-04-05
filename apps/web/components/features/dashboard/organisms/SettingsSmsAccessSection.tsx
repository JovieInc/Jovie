'use client';

import { MessageSquare } from 'lucide-react';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import { useSmsAccessRequestMutation } from '@/lib/queries/useSmsAccessRequestMutation';

interface SettingsSmsAccessSectionProps {
  readonly smsSubscriberCount: number;
  readonly alreadyRequested: boolean;
}

export function SettingsSmsAccessSection({
  smsSubscriberCount,
  alreadyRequested,
}: SettingsSmsAccessSectionProps) {
  const { mutate, isPending, isSuccess, isError, error } =
    useSmsAccessRequestMutation();

  const hasRequested = alreadyRequested || isSuccess;

  return (
    <SettingsPanel
      title='SMS Notifications'
      description='Let fans opt in to text alerts when you release new music.'
      actions={
        isPending ? (
          <SettingsStatusPill
            status={{ saving: true, success: null, error: null }}
          />
        ) : isError ? (
          <SettingsStatusPill
            status={{
              saving: false,
              success: null,
              error: error?.message ?? 'Request failed',
            }}
          />
        ) : null
      }
    >
      <div className='px-4 py-4 sm:px-5'>
        <div className='flex items-start gap-3'>
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-token/8'>
            <MessageSquare className='h-4 w-4 text-primary-token/68' />
          </div>
          <div className='flex-1'>
            {smsSubscriberCount === 0 ? (
              <p className='text-sm text-secondary-token'>
                No SMS subscribers yet. Fans can sign up on your profile page.
              </p>
            ) : (
              <p className='text-sm text-secondary-token'>
                <span className='font-semibold text-primary-token'>
                  {smsSubscriberCount}
                </span>{' '}
                {smsSubscriberCount === 1 ? 'fan has' : 'fans have'} signed up
                for text alerts.
              </p>
            )}
            <div className='mt-3'>
              {hasRequested ? (
                <p className='text-sm text-tertiary-token'>
                  Request submitted — we&apos;ll enable SMS for your profile
                  soon.
                </p>
              ) : (
                <button
                  type='button'
                  onClick={() => mutate()}
                  disabled={isPending}
                  className='inline-flex items-center gap-1.5 rounded-lg bg-primary-token px-3 py-1.5 text-sm font-medium text-primary-token-inverse transition-opacity hover:opacity-90 disabled:opacity-50'
                >
                  {isPending ? 'Requesting...' : 'Request SMS Access'}
                </button>
              )}
              {isError && (
                <p className='mt-1.5 text-xs text-red-500'>
                  {error?.message ?? 'Failed to submit request'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </SettingsPanel>
  );
}
