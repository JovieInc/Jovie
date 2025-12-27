'use client';

import { Button } from '@jovie/ui';
import { Input } from '@/components/atoms/Input';
import { CONTACT_ROLE_OPTIONS } from '@/lib/contacts/constants';
import type { ContactRole } from '@/types/contacts';

export interface ContactRoleSelectorProps {
  selectedRole: ContactRole;
  customLabel: string | null | undefined;
  onRoleChange: (role: ContactRole, customLabel: string | null) => void;
  onCustomLabelChange: (label: string) => void;
}

export function ContactRoleSelector({
  selectedRole,
  customLabel,
  onRoleChange,
  onCustomLabelChange,
}: ContactRoleSelectorProps) {
  return (
    <div className='space-y-2'>
      <p className='text-xs font-semibold text-secondary-token uppercase'>
        Role
      </p>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
        {CONTACT_ROLE_OPTIONS.map(option => (
          <Button
            key={option.value}
            type='button'
            size='sm'
            variant={selectedRole === option.value ? 'primary' : 'secondary'}
            className='justify-start'
            onClick={() =>
              onRoleChange(
                option.value,
                option.value === 'other' ? (customLabel ?? '') : null
              )
            }
          >
            {option.label}
          </Button>
        ))}
      </div>
      {selectedRole === 'other' && (
        <Input
          label='Contact label'
          placeholder='Sync & Licensing'
          value={customLabel ?? ''}
          onChange={event => onCustomLabelChange(event.target.value)}
        />
      )}
    </div>
  );
}
