'use client';

import {
  Badge,
  type CommonDropdownItem,
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
  DrawerCardActionBar,
  DrawerEditableTextField,
  DrawerPropertyRow,
  DrawerSurfaceCard,
  DrawerTabbedCard,
  DrawerTabs,
  EntityHeaderCard,
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

function contactFieldActions(field: string, value: string | null | undefined) {
  if (field === 'email' && value) {
    return [
      { id: 'open-email', ariaLabel: 'Open email', href: `mailto:${value}` },
    ];
  }
  if (field === 'phone' && value) {
    return [
      {
        id: 'open-phone',
        ariaLabel: 'Call phone number',
        href: `tel:${value}`,
      },
    ];
  }
  return [];
}

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
  const [activeTab, setActiveTab] = useState<'info' | 'territories'>('info');
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

  const { title: headerTitle, primaryActions } = useContactDetailHeaderParts({
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
    field: 'personName' | 'companyName' | 'email' | 'phone',
    label: string,
    value: string | null | undefined,
    placeholder: string
  ) => {
    let inputType: 'email' | 'tel' | 'text';
    if (field === 'email') {
      inputType = 'email';
    } else if (field === 'phone') {
      inputType = 'tel';
    } else {
      inputType = 'text';
    }

    return (
      <DrawerPropertyRow
        label={label}
        value={
          <DrawerEditableTextField
            label={label}
            value={value}
            editable
            placeholder={placeholder}
            emptyLabel={placeholder}
            inputType={inputType}
            onSave={async nextValue => {
              onUpdate({ [field]: nextValue } as Partial<EditableContact>);
              debouncedSave();
            }}
            copyValue={value ?? null}
            actions={contactFieldActions(field, value)}
            displayClassName='truncate text-app text-primary-token'
            emptyClassName='text-tertiary-token italic'
            inputClassName='h-8 text-app'
          />
        }
        labelWidth={96}
        labelClassName='normal-case tracking-normal text-xs'
        valueClassName='overflow-visible'
      />
    );
  };

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Contact details'
      title={headerTitle}
      onClose={hasContact ? undefined : handleClose}
      headerMode='minimal'
      hideMinimalHeaderBar={hasContact}
      contextMenuItems={contextMenuItems}
      isEmpty={!hasContact}
      emptyMessage='Select a contact to view details'
      entityHeader={
        contact ? (
          <DrawerSurfaceCard variant='card' className='overflow-hidden p-3'>
            <EntityHeaderCard
              eyebrow='Contact'
              title={contactDisplayName}
              subtitle={roleLabel}
              actions={
                <DrawerCardActionBar
                  primaryActions={primaryActions}
                  menuItems={contextMenuItems}
                  onClose={handleClose}
                  overflowTriggerPlacement='card-top-right'
                />
              }
              meta={
                territorySummary ? (
                  <div className='flex flex-wrap items-center gap-1.5 text-2xs text-tertiary-token'>
                    <Badge
                      size='sm'
                      className='rounded-[6px] border border-subtle bg-surface-0 px-1.5 text-[10px] text-secondary-token'
                    >
                      {territorySummary}
                    </Badge>
                  </div>
                ) : null
              }
              bodyClassName='pr-9'
            />
          </DrawerSurfaceCard>
        ) : undefined
      }
    >
      {contact && (
        <DrawerTabbedCard
          testId='contact-detail-tabbed-card'
          tabs={
            <DrawerTabs
              value={activeTab}
              onValueChange={v => setActiveTab(v as 'info' | 'territories')}
              options={[
                { value: 'info' as const, label: 'Info' },
                { value: 'territories' as const, label: 'Territories' },
              ]}
              ariaLabel='Contact tabs'
            />
          }
          contentClassName='pt-2'
        >
          {activeTab === 'info' && (
            <>
              <DrawerSection title='Role' className='space-y-2' surface='card'>
                <Label className='text-app text-secondary-token'>
                  Contact type
                </Label>
                <Select value={contact.role} onValueChange={handleRoleChange}>
                  <SelectTrigger className='h-8 rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 text-app'>
                    <SelectValue>{roleLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className='rounded-[10px] border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-1'>
                    {CONTACT_ROLE_OPTIONS.map(option => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className='rounded-[6px] px-2 py-1.5 text-app font-[510] text-secondary-token data-highlighted:bg-surface-0 data-highlighted:text-primary-token'
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
              </DrawerSection>

              <DrawerSection
                title='Contact Info'
                className='space-y-2'
                surface='card'
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
                  {renderEditableField(
                    'email',
                    'Email',
                    contact.email,
                    'Email'
                  )}
                  {renderEditableField(
                    'phone',
                    'Phone',
                    contact.phone,
                    'Phone'
                  )}
                </div>
              </DrawerSection>

              {/* Preferred Channel */}
              {hasEmailAndPhone && (
                <DrawerSection
                  title='Preferred Contact'
                  className='space-y-2'
                  surface='card'
                >
                  <div className='space-y-2'>
                    <Label className='text-app text-secondary-token'>
                      Default action
                    </Label>
                    <Select
                      value={contact.preferredChannel || ''}
                      onValueChange={handlePreferredChannelChange}
                    >
                      <SelectTrigger className='h-8 rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 text-app'>
                        <SelectValue placeholder='Select preferred channel'>
                          {getPreferredChannelLabel(contact.preferredChannel)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className='rounded-[10px] border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-1'>
                        <SelectItem value='email'>Email</SelectItem>
                        <SelectItem value='phone'>Phone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </DrawerSection>
              )}
            </>
          )}

          {activeTab === 'territories' && (
            <DrawerSection
              title='Territories'
              className='space-y-2'
              surface='card'
            >
              <div className='space-y-2'>
                <DrawerPropertyRow
                  label='Coverage'
                  value={
                    <Badge
                      size='sm'
                      className='rounded-[6px] border border-subtle bg-surface-0 px-1.5 text-[10px] text-secondary-token'
                    >
                      {territorySummary}
                    </Badge>
                  }
                  labelWidth={96}
                  labelClassName='normal-case tracking-normal text-xs'
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
                          'rounded-[8px] border px-2.5 py-1 text-xs font-[510] transition-[background-color,border-color,color] duration-150',
                          isSelected
                            ? 'border-(--linear-border-focus)/35 bg-surface-1 text-primary-token'
                            : 'border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token hover:bg-surface-1 hover:text-primary-token'
                        )}
                      >
                        {territory}
                      </button>
                    );
                  })}
                </div>
              </div>
            </DrawerSection>
          )}
          {/* Error display */}
          {contact.error && (
            <div className='rounded-[8px] border border-destructive/15 bg-destructive/5 px-3 py-2'>
              <p className='text-app text-destructive'>{contact.error}</p>
            </div>
          )}

          {/* Saving indicator */}
          {contact.isSaving && (
            <div className='rounded-[8px] border border-(--linear-app-frame-seam) bg-surface-0 px-3 py-2 text-center text-app text-tertiary-token'>
              Saving...
            </div>
          )}
        </DrawerTabbedCard>
      )}
    </EntitySidebarShell>
  );
});
