'use client';

import { RadioGroup, RadioGroupItem } from '@jovie/ui';
import type { ContactChannel } from '@/types/contacts';

const CONTACT_CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
] as const satisfies readonly {
  readonly value: ContactChannel;
  readonly label: string;
}[];

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
  const labelId = `preferred-${contactId}-label`;

  return (
    <div className='space-y-2'>
      <p
        id={labelId}
        className='text-app font-caption text-secondary-token tracking-normal'
      >
        Default action
      </p>
      <RadioGroup
        aria-labelledby={labelId}
        className='flex flex-wrap gap-4'
        name={`preferred-${contactId}`}
        value={preferredChannel ?? 'email'}
        onValueChange={channel => onChannelChange(channel as ContactChannel)}
      >
        {CONTACT_CHANNEL_OPTIONS.map(option => {
          const optionId = `preferred-${contactId}-${option.value}`;

          return (
            <div
              key={option.value}
              className='flex items-center gap-2 text-app text-secondary-token'
            >
              <RadioGroupItem
                id={optionId}
                value={option.value}
                className='h-3.5 w-3.5'
              />
              <label htmlFor={optionId} className='cursor-pointer'>
                {option.label}
              </label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}
