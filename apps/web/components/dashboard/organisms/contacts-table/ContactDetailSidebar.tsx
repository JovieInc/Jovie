'use client';

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import { DrawerPropertyRow } from '@/components/molecules/drawer/DrawerPropertyRow';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import {
  CONTACT_ROLE_OPTIONS,
  CONTACT_TERRITORY_PRESETS,
  getContactRoleLabel,
  summarizeTerritories,
} from '@/lib/contacts/constants';
import { PACER_TIMING } from '@/lib/pacer/hooks/timing';
import { cn } from '@/lib/utils';
import type { ContactChannel, ContactRole } from '@/types/contacts';
import { ContactDetailHeader } from './ContactDetailHeader';

function getPreferredChannelLabel(
  channel: ContactChannel | null | undefined
): string {
  if (channel === 'email') return 'Email';
  if (channel === 'phone') return 'Phone';
  return 'Select preferred';
}

type EditableField =
  | 'role'
  | 'personName'
  | 'companyName'
  | 'email'
  | 'phone'
  | 'territories'
  | 'preferredChannel'
  | null;

interface ContactDetailSidebarProps {
  readonly contact: EditableContact | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onUpdate: (updates: Partial<EditableContact>) => void;
  readonly onSave: () => void;
  readonly onDelete: () => void;
}

export const ContactDetailSidebar = memo(function ContactDetailSidebar({
  contact,
  isOpen,
  onClose,
  onUpdate,
  onSave,
  onDelete,
}: ContactDetailSidebarProps) {
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [editValue, setEditValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced save: coalesces rapid edits into a single save call
  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      onSave();
    }, PACER_TIMING.SAVE_DEBOUNCE_MS);
  }, [onSave]);

  // Flush any pending debounced save immediately
  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      onSave();
    }
  }, [onSave]);

  // Flush pending save on close to prevent data loss
  const handleClose = useCallback(() => {
    flushSave();
    onClose();
  }, [flushSave, onClose]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Reset editing state when contact changes
  useEffect(() => {
    setEditingField(null);
    setEditValue('');
  }, [contact?.id]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const startEditing = useCallback(
    (field: EditableField) => {
      if (!contact || !field) return;
      setEditingField(field);
      const value = contact[field as keyof EditableContact];
      setEditValue(typeof value === 'string' ? value : '');
    },
    [contact]
  );

  const saveField = useCallback(() => {
    if (!editingField || !contact) return;

    const trimmedValue = editValue.trim();
    const currentValue = contact[editingField as keyof EditableContact];

    // Only update if value changed
    if (trimmedValue !== currentValue) {
      onUpdate({ [editingField]: trimmedValue || null });
      debouncedSave();
    }

    setEditingField(null);
    setEditValue('');
  }, [editingField, editValue, contact, onUpdate, debouncedSave]);

  const cancelEditing = useCallback(() => {
    setEditingField(null);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveField();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEditing();
      }
    },
    [saveField, cancelEditing]
  );

  const handleRoleChange = useCallback(
    (newRole: string) => {
      onUpdate({ role: newRole as ContactRole });
      debouncedSave();
    },
    [onUpdate, debouncedSave]
  );

  const handlePreferredChannelChange = useCallback(
    (channel: string) => {
      onUpdate({ preferredChannel: channel as ContactChannel });
      debouncedSave();
    },
    [onUpdate, debouncedSave]
  );

  const handleTerritoryToggle = useCallback(
    (territory: string) => {
      if (!contact) return;
      const exists = contact.territories.includes(territory);

      let newTerritories: string[];

      if (territory === 'Worldwide') {
        // Toggle Worldwide: if already selected, remove it; otherwise set it as the only territory
        newTerritories = exists ? [] : ['Worldwide'];
      } else if (exists) {
        // Removing a non-Worldwide territory
        newTerritories = contact.territories.filter(t => t !== territory);
      } else {
        // Adding a non-Worldwide territory: remove Worldwide if present
        newTerritories = [
          ...contact.territories.filter(t => t !== 'Worldwide'),
          territory,
        ];
      }

      onUpdate({ territories: newTerritories });
      debouncedSave();
    },
    [contact, onUpdate, debouncedSave]
  );

  if (!contact) {
    return (
      <RightDrawer
        isOpen={isOpen}
        width={SIDEBAR_WIDTH}
        ariaLabel='Contact details'
        className='bg-surface-1'
      >
        <div className='flex h-full items-center justify-center p-4'>
          <p className='text-sm text-tertiary-token'>
            Select a contact to view details
          </p>
        </div>
      </RightDrawer>
    );
  }

  const roleLabel = getContactRoleLabel(contact.role, contact.customLabel);
  const { summary: territorySummary } = summarizeTerritories(
    contact.territories
  );
  const hasEmailAndPhone = Boolean(contact.email) && Boolean(contact.phone);

  const renderEditableField = (
    field: EditableField,
    label: string,
    value: string | null | undefined,
    placeholder: string
  ) => {
    const isEditing = editingField === field;
    const displayValue = value || (
      <span className='text-tertiary-token italic'>{placeholder}</span>
    );

    // Use consistent grid layout for both states to prevent layout shift
    // Both states use h-8 (32px) height to match the input height
    if (isEditing) {
      return (
        <div className='grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 min-h-8'>
          <Label className='text-xs text-secondary-token'>{label}</Label>
          <Input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={saveField}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className='h-8 text-xs'
          />
        </div>
      );
    }

    return (
      <button
        type='button'
        onClick={() => startEditing(field)}
        className='grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 min-h-8 w-full text-left rounded-md -mx-2 px-2 hover:bg-surface-2 transition-colors cursor-pointer'
      >
        <span className='text-xs text-secondary-token'>{label}</span>
        <span className='text-xs text-primary-token hover:text-primary-token transition-colors truncate'>
          {displayValue}
        </span>
      </button>
    );
  };

  return (
    <RightDrawer
      isOpen={isOpen}
      width={SIDEBAR_WIDTH}
      ariaLabel='Contact details'
      className='bg-surface-1'
    >
      <ContactDetailHeader
        role={contact.role}
        customLabel={contact.customLabel}
        email={contact.email}
        onClose={handleClose}
        onDelete={onDelete}
      />

      <div className='flex-1 overflow-auto px-3 py-3 space-y-5'>
        {/* Role Section */}
        <DrawerSection title='Role'>
          <div className='space-y-2'>
            <Label className='text-xs text-secondary-token'>Contact type</Label>
            <Select value={contact.role} onValueChange={handleRoleChange}>
              <SelectTrigger className='h-9 text-xs rounded-lg border border-subtle bg-surface-1 px-3'>
                <SelectValue>{roleLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent className='rounded-lg border border-subtle bg-surface-1 shadow-lg p-1'>
                {CONTACT_ROLE_OPTIONS.map(option => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className='rounded-md px-2.5 py-2 text-sm font-medium text-secondary-token data-highlighted:bg-surface-2 data-highlighted:text-primary-token'
                  >
                    <div className='flex items-center gap-2'>
                      <Icon
                        name={option.iconName}
                        className='h-4 w-4 text-tertiary-token'
                      />
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DrawerSection>

        {/* Contact Info Section */}
        <DrawerSection title='Contact Info'>
          <div className='space-y-3'>
            {renderEditableField(
              'personName',
              'Name',
              contact.personName,
              'Contact name'
            )}
            {renderEditableField(
              'companyName',
              'Company',
              contact.companyName,
              'Company name'
            )}
            {renderEditableField('email', 'Email', contact.email, 'Email')}
            {renderEditableField('phone', 'Phone', contact.phone, 'Phone')}
          </div>
        </DrawerSection>

        {/* Preferred Channel */}
        {hasEmailAndPhone && (
          <DrawerSection title='Preferred Contact'>
            <div className='space-y-2'>
              <Label className='text-xs text-secondary-token'>
                Default action
              </Label>
              <Select
                value={contact.preferredChannel || ''}
                onValueChange={handlePreferredChannelChange}
              >
                <SelectTrigger className='h-9 text-xs'>
                  <SelectValue placeholder='Select preferred channel'>
                    {getPreferredChannelLabel(contact.preferredChannel)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='email'>Email</SelectItem>
                  <SelectItem value='phone'>Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DrawerSection>
        )}

        {/* Territories Section */}
        <DrawerSection title='Territories'>
          <div className='space-y-3'>
            <DrawerPropertyRow label='Coverage' value={territorySummary} />
            <div className='flex flex-wrap gap-1.5'>
              {CONTACT_TERRITORY_PRESETS.map(territory => {
                const isSelected = contact.territories.includes(territory);
                return (
                  <button
                    key={territory}
                    type='button'
                    onClick={() => handleTerritoryToggle(territory)}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md border transition-colors',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-surface-2 text-secondary-token border-subtle hover:bg-surface-3'
                    )}
                  >
                    {territory}
                  </button>
                );
              })}
            </div>
          </div>
        </DrawerSection>

        {/* Error display */}
        {contact.error && (
          <div className='rounded-md bg-red-50 dark:bg-red-900/20 p-3'>
            <p className='text-xs text-red-600 dark:text-red-400'>
              {contact.error}
            </p>
          </div>
        )}

        {/* Saving indicator */}
        {contact.isSaving && (
          <div className='text-xs text-tertiary-token text-center'>
            Saving...
          </div>
        )}
      </div>
    </RightDrawer>
  );
});
