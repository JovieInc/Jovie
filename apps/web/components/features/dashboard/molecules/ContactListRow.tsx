'use client';

import { Badge, Button } from '@jovie/ui';
import { memo } from 'react';
import {
  getContactRoleLabel,
  summarizeTerritories,
} from '@/lib/contacts/constants';
import type { EditableContact } from '@/types/contacts';

export interface ContactListRowProps {
  readonly contact: EditableContact;
  readonly isSelected: boolean;
  readonly onClick: () => void;
}

export const ContactListRow = memo(function ContactListRow({
  contact,
  isSelected,
  onClick,
}: ContactListRowProps) {
  const roleLabel = getContactRoleLabel(contact.role, contact.customLabel);
  const { summary: territorySummary } = summarizeTerritories(
    contact.territories
  );

  return (
    <Button
      type='button'
      variant='ghost'
      size='md'
      onClick={onClick}
      aria-pressed={isSelected}
      className={`h-auto w-full justify-start gap-3 rounded-lg border px-3 py-3 text-left font-normal before:hidden [&>span]:w-full [&>span]:justify-start [&>span]:gap-3 ${
        isSelected
          ? 'border-subtle bg-surface-0'
          : 'border-transparent hover:bg-surface-0'
      }`}
    >
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='text-app font-caption text-secondary-token tracking-normal'>
            {roleLabel}
          </span>
        </div>
        <div className='mt-0.5 flex items-center gap-2'>
          {contact.personName ? (
            <span className='truncate text-app text-primary-token'>
              {contact.personName}
            </span>
          ) : null}
          {contact.email ? (
            <span className='truncate text-2xs text-secondary-token'>
              {contact.email}
            </span>
          ) : null}
        </div>
      </div>
      {territorySummary ? (
        <Badge size='sm' className='shrink-0'>
          {territorySummary}
        </Badge>
      ) : null}
    </Button>
  );
});
