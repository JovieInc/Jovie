// @coverage-via apps/web/tests/unit/dashboard/ContactDetailSidebar.test.tsx
'use client';

import {
  badgeVariants,
  type CommonDropdownItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { useDebouncer } from '@tanstack/react-pacer';
import { Trash2 } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  DrawerChoiceChipGroup,
  DrawerEditableTextField,
  DrawerEntityAvatar,
  DrawerPropertyRow,
  EntityHeader,
  EntityTabbedRail,
} from '@/components/molecules/drawer';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { COPY_FALLBACKS } from '@/data/copyFallbacks';
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

function getPreferredChannelLabel(
  channel: ContactChannel | null | undefined
): string {
  if (channel === 'email') return 'Email';
  if (channel === 'phone') return 'Phone';
  return 'Select preferred';
}

const CONTACT_TAB_OPTIONS = [
  { value: 'info' as const, label: 'Info' },
  { value: 'territories' as const, label: 'Territories' },
];

const CONTACT_TERRITORY_OPTIONS = CONTACT_TERRITORY_PRESETS.map(territory => ({
  value: territory,
  label: territory,
}));

const CONTACT_TERRITORY_CHIP_CLASSNAME = cn(
  badgeVariants({ size: 'sm' }),
  'rounded-md border border-subtle bg-surface-0 px-1.5 text-3xs text-secondary-token'
);

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
  // Use a ref so the debounced save always calls the latest onSave,
  // avoiding stale closures when contact state updates between scheduling and firing.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Debounced save: coalesces rapid edits into a single save call. A pending
  // save is flushed (not cancelled) on every unmount path, so an edit made
  // just before a route change or remount is never dropped.
  const saveDebouncer = useDebouncer(() => onSaveRef.current(), {
    wait: PACER_TIMING.SAVE_DEBOUNCE_MS,
    onUnmount: debouncer => debouncer.flush(),
  });
  const debouncedSave = saveDebouncer.maybeExecute;
  const flushSave = saveDebouncer.flush;

  // Flush pending save on close to prevent data loss
  const handleClose = useCallback(() => {
    flushSave();
    onClose();
  }, [flushSave, onClose]);

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

  const hasContact = Boolean(contact);
  const roleLabel = contact
    ? getContactRoleLabel(contact.role, contact.customLabel)
    : '';
  const contactDisplayName =
    contact?.personName?.trim() ||
    contact?.companyName?.trim() ||
    COPY_FALLBACKS.contact;
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
            copyValue={field === 'email' || field === 'phone' ? value : ''}
            actions={contactFieldActions(field, value)}
            displayClassName='truncate text-app text-primary-token'
            emptyClassName='text-tertiary-token italic'
          />
        }
        labelWidth={96}
        labelClassName='normal-case tracking-normal text-xs'
        valueClassName='overflow-visible'
      />
    );
  };

  return (
    <EntityTabbedRail
      isOpen={isOpen}
      ariaLabel='Contact details'
      title={roleLabel || COPY_FALLBACKS.contact}
      onClose={hasContact ? undefined : handleClose}
      hideMinimalHeaderBar={hasContact}
      contextMenuItems={contextMenuItems}
      isEmpty={!hasContact}
      emptyMessage='Select a contact to view details'
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabOptions={CONTACT_TAB_OPTIONS}
      tabsAriaLabel='Contact tabs'
      sectionKind={activeTab === 'info' ? 'facts' : 'details'}
      tabbedCardTestId='contact-detail-tabbed-card'
      contentClassName='pt-2'
      entityHeader={
        contact ? (
          <EntityHeader
            layout='grid'
            title={contactDisplayName}
            subtitle={roleLabel}
            stableLayout
            titleLineClamp={1}
            subtitleLineClamp={1}
            reserveSubtitleSlot
            reserveMetaSlot
            metaOverflow='scroll'
            thumbnail={
              <DrawerEntityAvatar
                name={contactDisplayName}
                testId='contact-entity-avatar-frame'
              />
            }
            meta={
              territorySummary ? (
                <div className='flex items-center gap-1.5 text-2xs text-tertiary-token'>
                  <span className={CONTACT_TERRITORY_CHIP_CLASSNAME}>
                    {territorySummary}
                  </span>
                </div>
              ) : undefined
            }
            actions={
              <DrawerHeaderActions
                primaryActions={[]}
                overflowActions={[
                  {
                    id: 'delete',
                    label: 'Delete Contact',
                    icon: Trash2,
                    onClick: onDelete,
                  },
                ]}
                menuItems={contextMenuItems}
                onClose={handleClose}
              />
            }
            className='px-3 pt-3'
            titleClassName='text-base leading-5 tracking-tighter'
            data-testid='contact-detail-entity-header'
          />
        ) : undefined
      }
    >
      {contact ? (
        <>
          {activeTab === 'info' && (
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
              <DrawerPropertyRow
                label='Role'
                value={
                  <Select value={contact.role} onValueChange={handleRoleChange}>
                    <SelectTrigger aria-label='Role'>
                      <SelectValue>{roleLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_ROLE_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
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
                }
                labelWidth={96}
                labelClassName='normal-case tracking-normal text-xs'
              />
              {renderEditableField(
                'email',
                'Email',
                contact.email,
                'Add Email'
              )}
              {renderEditableField(
                'phone',
                'Phone',
                contact.phone,
                'Add Phone'
              )}
              {hasEmailAndPhone && (
                <DrawerPropertyRow
                  label='Preferred'
                  value={
                    <Select
                      value={contact.preferredChannel || ''}
                      onValueChange={handlePreferredChannelChange}
                    >
                      <SelectTrigger aria-label='Preferred Contact Method'>
                        <SelectValue placeholder='Select preferred channel'>
                          {getPreferredChannelLabel(contact.preferredChannel)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='email'>Email</SelectItem>
                        <SelectItem value='phone'>Phone</SelectItem>
                      </SelectContent>
                    </Select>
                  }
                  labelWidth={96}
                  labelClassName='normal-case tracking-normal text-xs'
                />
              )}
            </div>
          )}

          {activeTab === 'territories' && (
            <DrawerSection className='space-y-2'>
              <div className='space-y-2'>
                <DrawerPropertyRow
                  label='Coverage'
                  value={
                    <span className={CONTACT_TERRITORY_CHIP_CLASSNAME}>
                      {territorySummary}
                    </span>
                  }
                  labelWidth={96}
                  labelClassName='normal-case tracking-normal text-xs'
                />
                <DrawerChoiceChipGroup
                  options={CONTACT_TERRITORY_OPTIONS}
                  selectedValues={contact.territories}
                  onToggle={handleTerritoryToggle}
                  ariaLabel='Contact territories'
                  testId='contact-territory-choices'
                />
              </div>
            </DrawerSection>
          )}
          {/* Error display */}
          {contact.error && (
            <div role='alert' className='px-1 py-2'>
              <p className='text-app text-destructive'>{contact.error}</p>
            </div>
          )}

          {/* Saving indicator */}
          {contact.isSaving && (
            <div
              role='status'
              aria-live='polite'
              className='px-1 py-2 text-center text-app text-tertiary-token'
            >
              Saving…
            </div>
          )}
        </>
      ) : null}
    </EntityTabbedRail>
  );
});
