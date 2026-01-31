'use client';

import { Button } from '@jovie/ui';
import { memo, useCallback } from 'react';
import { Input } from '@/components/atoms/Input';
import { CONTACT_ROLE_OPTIONS } from '@/lib/contacts/constants';
import type { ContactRole } from '@/types/contacts';

interface RoleButtonProps {
  value: ContactRole;
  readonly label: string;
  readonly isSelected: boolean;
  readonly customLabel: string | null | undefined;
  onRoleChange: (role: ContactRole, customLabel: string | null) => void;
}

const RoleButton = memo(function RoleButton({
  value,
  label,
  isSelected,
  customLabel,
  onRoleChange,
}: RoleButtonProps) {
  const handleClick = useCallback(() => {
    onRoleChange(value, value === 'other' ? (customLabel ?? '') : null);
  }, [onRoleChange, value, customLabel]);

  return (
    <Button
      type='button'
      size='sm'
      variant={isSelected ? 'primary' : 'secondary'}
      className='justify-start'
      onClick={handleClick}
    >
      {label}
    </Button>
  );
});

export interface ContactRoleSelectorProps {
  selectedRole: ContactRole;
  readonly customLabel: string | null | undefined;
  onRoleChange: (role: ContactRole, customLabel: string | null) => void;
  readonly onCustomLabelChange: (label: string) => void;
}

export function ContactRoleSelector({
  selectedRole,
  customLabel,
  onRoleChange,
  onCustomLabelChange,
}: ContactRoleSelectorProps) {
  const handleCustomLabelChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onCustomLabelChange(event.target.value);
    },
    [onCustomLabelChange]
  );

  return (
    <div className='space-y-2'>
      <p className='text-xs font-semibold text-secondary-token uppercase'>
        Role
      </p>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
        {CONTACT_ROLE_OPTIONS.map(option => (
          <RoleButton
            key={option.value}
            value={option.value}
            label={option.label}
            isSelected={selectedRole === option.value}
            customLabel={customLabel}
            onRoleChange={onRoleChange}
          />
        ))}
      </div>
      {selectedRole === 'other' && (
        <Input
          label='Contact label'
          placeholder='Sync & Licensing'
          value={customLabel ?? ''}
          onChange={handleCustomLabelChange}
        />
      )}
    </div>
  );
}
