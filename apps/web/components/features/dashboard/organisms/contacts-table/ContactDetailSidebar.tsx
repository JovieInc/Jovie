'use client';

import {
  Badge,
  type CommonDropdownItem,
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
import {
  DrawerPropertyRow,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import type { EditableContact } from '@/features/dashboard/hooks/useContactsManager';
import {
  CONTACT_ROLE_OPTIONS,
  CONTACT_TERRITORY_PRESETS,
  getContactRoleLabel,
  summarizeTerritories,
} from '@/lib/contacts/constants';
import { PACER_TIMING } from '@/lib/pacer/hooks/timing';
import { cn } from '@/lib/utils';
import type { ContactChannel, ContactRole } from '@/types/contacts';
import { useContactDetailHeaderParts } from './ContactDetailHeader';

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
  readonly contextMenuItems?: CommonDropdownItem[];
}

export const ContactDetailSidebar = memo(function ContactDetailSidebar({
  contact,
  isOpen,
  onClose,
  onUpdate,
  onSave,
  onDelete,
  contextMenuItems,
}: ContactDetailSidebarProps) {
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [editValue, setEditValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use a ref so the debounced timeout always calls the latest onSave,
  // avoiding stale closures when contact state updates between scheduling and firing.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Debounced save: coalesces rapid edits into a single save call
  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      onSaveRef.current();
    }, PACER_TIMING.SAVE_DEBOUNCE_MS);
  }, []);

  // Flush any pending debounced save immediately
  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      onSaveRef.current();
    }
  }, []);

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

  const { title: headerTitle, actions: headerActions } =
    useContactDetailHeaderParts({
      role: contact?.role ?? 'other',
      customLabel: contact?.customLabel,
      email: contact?.email,
      onDelete,
      onClose: handleClose,
    });

  const hasContact = Boolean(contact);
  const roleLabel = contact
    ? getContactRoleLabel(contact.role, contact.customLabel)
    : '';
  const contactDisplayName =
    contact?.personName?.trim() ||
    contact?.companyName?.trim() ||
    'Untitled contact';
  const territorySummary = contact
    ? summarizeTerritories(contact.territories).summary
    : '';
  const hasEmailAndPhone = Boolean(contact?.email) && Boolean(contact?.phone);

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
        <DrawerPropertyRow
          label={label}
          value={
            <Input
              ref={inputRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={saveField}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className='h-8 text-[13px]'
            />
          }
          labelWidth={96}
          className='px-0 py-0'
          labelClassName='normal-case tracking-normal text-[12px]'
          valueClassName='overflow-visible'
        />
      );
    }

    return (
      <DrawerPropertyRow
        label={label}
        value={
          <span className='truncate text-[13px] text-(--linear-text-primary)'>
            {displayValue}
          </span>
        }
        labelWidth={96}
        interactive
        onClick={() => startEditing(field)}
        labelClassName='normal-case tracking-normal text-[12px]'
      />
    );
  };

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Contact details'
      title={headerTitle}
      onClose={handleClose}
      headerActions={headerActions}
      contextMenuItems={contextMenuItems}
      isEmpty={!hasContact}
      emptyMessage='Select a contact to view details'
      entityHeader={
        contact ? (
          <div className='rounded-[10px] border border-(--linear-border-subtle)/75 bg-(--linear-bg-surface-0) px-3 py-2.5'>
            <p className='text-[15px] font-[520] leading-5 text-(--linear-text-primary)'>
              {contactDisplayName}
            </p>
            <p className='mt-1 text-[12px] text-(--linear-text-secondary)'>
              {roleLabel}
            </p>
          </div>
        ) : undefined
      }
    >
      {contact && (
        <>
          <DrawerSection title='Role' className='space-y-2'>
            <div className='rounded-[10px] border border-(--linear-border-subtle)/75 bg-(--linear-bg-surface-0) p-2.5'>
              <Label className='text-[13px] text-(--linear-text-secondary)'>
                Contact type
              </Label>
              <Select value={contact.role} onValueChange={handleRoleChange}>
                <SelectTrigger className='h-9 rounded-lg border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 text-[13px]'>
                  <SelectValue>{roleLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent className='p-1'>
                  {CONTACT_ROLE_OPTIONS.map(option => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className='rounded-md px-2.5 py-2 text-[13px] font-[510] text-(--linear-text-secondary) data-highlighted:bg-(--linear-bg-surface-0) data-highlighted:text-(--linear-text-primary)'
                    >
                      <div className='flex items-center gap-2'>
                        <Icon
                          name={option.iconName}
                          className='h-4 w-4 text-(--linear-text-tertiary)'
                        />
                        <span>{option.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DrawerSection>

          <DrawerSection
            title='Contact Info'
            className='border-t border-(--linear-border-subtle)/65 pt-4'
          >
            <div className='space-y-1'>
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
            <DrawerSection
              title='Preferred Contact'
              className='border-t border-(--linear-border-subtle)/65 pt-4'
            >
              <div className='space-y-2'>
                <Label className='text-[13px] text-(--linear-text-secondary)'>
                  Default action
                </Label>
                <Select
                  value={contact.preferredChannel || ''}
                  onValueChange={handlePreferredChannelChange}
                >
                  <SelectTrigger className='h-9 text-[13px]'>
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

          <DrawerSection
            title='Territories'
            className='border-t border-(--linear-border-subtle)/65 pt-4'
          >
            <div className='space-y-3'>
              <DrawerPropertyRow
                label='Coverage'
                value={<Badge size='sm'>{territorySummary}</Badge>}
                labelWidth={96}
                labelClassName='normal-case tracking-normal text-[12px]'
              />
              <div className='flex flex-wrap gap-1.5'>
                {CONTACT_TERRITORY_PRESETS.map(territory => {
                  const isSelected = contact.territories.includes(territory);
                  return (
                    <button
                      key={territory}
                      type='button'
                      onClick={() => handleTerritoryToggle(territory)}
                      className={cn(
                        'rounded-[8px] border px-2 py-1 text-[13px] transition-[background-color,border-color,color] duration-150',
                        isSelected
                          ? 'border-(--linear-border-focus) bg-(--linear-bg-surface-1) text-(--linear-text-primary)'
                          : 'border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-(--linear-text-secondary) hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-1)'
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
            <div className='rounded-[10px] border border-red-500/20 bg-red-500/5 p-3'>
              <p className='text-[13px] text-destructive'>{contact.error}</p>
            </div>
          )}

          {/* Saving indicator */}
          {contact.isSaving && (
            <div className='text-center text-[13px] text-(--linear-text-tertiary)'>
              Saving...
            </div>
          )}
        </>
      )}
    </EntitySidebarShell>
  );
});
