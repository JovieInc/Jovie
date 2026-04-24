'use client';

import type { ContactChannel } from '@/types/contacts';

export interface ContactPreferredChannelProps {
  readonly contactId: string;
  readonly preferredChannel: ContactChannel | null | undefined;
  readonly onChannelChange: (channel: ContactChannel) => void;
}

export function ContactPreferredChannel({
  contactId,
  preferredChannel,
  onChannelChange,
}: ContactPreferredChannelProps) {
  return (
    <div className='space-y-2'>
      <p className='text-app font-caption text-secondary-token tracking-normal'>
        Default action
      </p>
      <div className='flex flex-wrap gap-4'>
        <label className='flex items-center gap-2 text-app text-secondary-token'>
          <input
            type='radio'
            name={`preferred-${contactId}`}
            value='email'
            checked={(preferredChannel ?? 'email') === 'email'}
            onChange={() => onChannelChange('email')}
          />{' '}
          Email
        </label>
        <label className='flex items-center gap-2 text-app text-secondary-token'>
          <input
            type='radio'
            name={`preferred-${contactId}`}
            value='phone'
            checked={preferredChannel === 'phone'}
            onChange={() => onChannelChange('phone')}
          />{' '}
          Phone
        </label>
      </div>
    </div>
  );
}
