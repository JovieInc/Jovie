'use client';

import { Badge } from '@jovie/ui';
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
    <button
      type='button'
      onClick={onClick}
      aria-pressed={isSelected}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-[background-color,border-color,box-shadow] duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-base ${
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
    </button>
  );
});
