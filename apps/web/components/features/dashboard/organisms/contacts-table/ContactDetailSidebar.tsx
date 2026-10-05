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
import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import {
  DrawerChoiceChipGroup,
  DrawerEditableTextField,
  DrawerEntityAvatar,
  DrawerPropertyRow,
  EntityHeader,
  EntityTabbedRail,
} from '@/components/molecules/drawer';
import { DrawerSection } from '@/components/molecules/drawer/DrawerSection';
import {
  type DrawerHeaderAction,
  DrawerHeaderActions,
} from '@/components/molecules/drawer-header/DrawerHeaderActions';
import type { EditableContact } from '@/features/dashboard/hooks/useContactsManager';
import {
  CONTACT_ROLE_OPTIONS,
  CONTACT_TERRITORY_PRESETS,
  getContactRoleLabel,
  summarizeTerritories,
} from '@/lib/contacts/constants';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { PACER_TIMING } from '@/lib/pacer/hooks/timing';
import { cn } from '@/lib/utils';
import type { ContactChannel, ContactRole } from '@/types/contacts';
import { ContactReachActions } from './ContactReachActions';

function getPreferredChannelLabel(
  channel: ContactChannel | null | undefined
): string {
  if (channel === 'email') return 'Email';
  if (channel === 'phone') return 'Phone';
  return 'Select preferred';
}

type OptionalContactField = 'companyName' | 'email' | 'phone';

const OPTIONAL_CONTACT_FIELDS: readonly {
  readonly key: OptionalContactField;
  readonly label: string;
  readonly placeholder: string;
}[] = [
  { key: 'companyName', label: 'Company', placeholder: 'Company name' },
  { key: 'email', label: 'Email', placeholder: 'Email' },
  { key: 'phone', label: 'Phone', placeholder: 'Phone' },
];

function isContactFieldShown(
  contact: EditableContact,
  field: OptionalContactField,
  revealed: ReadonlySet<OptionalContactField>
): boolean {
  return Boolean(contact[field]?.trim()) || revealed.has(field);
}

function AddContactFieldMenu({
  contact,
  revealedFields,
  onAdd,
}: Readonly<{
  contact: EditableContact;
  revealedFields: ReadonlySet<OptionalContactField>;
  onAdd: (field: OptionalContactField) => void;
}>) {
  const missing = OPTIONAL_CONTACT_FIELDS.filter(
    field => !isContactFieldShown(contact, field.key, revealedFields)
  );
  if (missing.length === 0) return null;
  return (
    <TableActionMenu
      trigger='custom'
      align='start'
      items={missing.map(field => ({
        id: `add-${field.key}`,
        label: field.label,
        onClick: () => onAdd(field.key),
      }))}
    >
      <button type='button' className={ADD_FIELD_BUTTON_CLASSNAME}>
        <Plus className='h-3.5 w-3.5' aria-hidden='true' />
        Add Field
      </button>
    </TableActionMenu>
  );
}

const ADD_FIELD_BUTTON_CLASSNAME =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-app text-tertiary-token transition-colors hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/16';

const CONTACT_TAB_OPTIONS = [
  { value: 'info' as const, label: 'Info' },
  { value: 'territories' as const, label: 'Territories' },
];

const CONTACT_TERRITORY_OPTIONS = CONTACT_TERRITORY_PRESETS.map(territory => ({
  value: territory,
  label: territory,
}));

function useContactDetailHeaderParts({
  role,
  customLabel,
  email,
  onDelete,
  onClose,
  menuItems,
}: Readonly<{
  role: ContactRole;
  customLabel?: string | null;
  email?: string | null;
  onDelete: () => void;
  onClose?: () => void;
  menuItems?: readonly CommonDropdownItem[];
}>) {
  const notifications = useNotifications();
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    []
  );

  const handleCopyEmail = useCallback(() => {
    if (!email) return;
    void navigator.clipboard.writeText(email);
    notifications.success('Email copied');
    setIsCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  }, [email, notifications]);

  const primaryActions: DrawerHeaderAction[] = [];
  if (email) {
    // eslint-disable-next-line react-hooks/refs -- ref value read is intentional for action state
    primaryActions.push({
      id: 'copy',
      label: isCopied ? 'Copied!' : 'Copy email',
      icon: Copy,
      activeIcon: Check,
      isActive: isCopied,
      onClick: handleCopyEmail,
    });
  }
  const overflowActions: DrawerHeaderAction[] = [
    { id: 'delete', label: 'Delete Contact', icon: Trash2, onClick: onDelete },
  ];

  return {
    title: getContactRoleLabel(role, customLabel),
    actions:
      primaryActions.length > 0 || overflowActions.length > 0 || onClose ? (
        <DrawerHeaderActions
          primaryActions={primaryActions}
          overflowActions={overflowActions}
          menuItems={menuItems}
          onClose={onClose}
        />
      ) : undefined,
    primaryActions,
    overflowActions,
  };
}

const CONTACT_SECTION_LABEL_CLASSNAME =
  'inline-flex cursor-pointer items-center text-app font-medium tracking-normal leading-none text-secondary-token';

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
  // Empty fields stay hidden until someone adds them (filled-fields-only rail).
  const [revealedFields, setRevealedFields] = useState<
    ReadonlySet<OptionalContactField>
  >(() => new Set());
  const contactId = contact?.id;
  useEffect(() => {
    if (contactId) setRevealedFields(new Set());
  }, [contactId]);
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

  const { title: headerTitle, actions: headerActions } =
    useContactDetailHeaderParts({
      role: contact?.role ?? 'other',
      customLabel: contact?.customLabel,
      email: contact?.email,
      onDelete,
      onClose: handleClose,
      menuItems: contextMenuItems,
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
    <EntityTabbedRail
      isOpen={isOpen}
      ariaLabel='Contact details'
      title={headerTitle}
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
            actions={headerActions}
            className='px-2 py-2'
            titleClassName='text-base leading-5 tracking-[-0.02em]'
            data-testid='contact-detail-entity-header'
          />
        ) : undefined
      }
    >
      {contact ? (
        <>
          {activeTab === 'info' && (
            <>
              <DrawerSection
                title='Role'
                className='space-y-2 border-b border-subtle pb-3'
              >
                <span className={CONTACT_SECTION_LABEL_CLASSNAME}>
                  Contact Type
                </span>
                <Select value={contact.role} onValueChange={handleRoleChange}>
                  <SelectTrigger aria-label='Contact Type'>
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
              </DrawerSection>

              <DrawerSection
                title='Contact Info'
                className='space-y-2 border-b border-subtle pb-3'
              >
                <div className='space-y-1'>
                  {renderEditableField(
                    'personName',
                    'Name',
                    contact.personName,
                    'Contact name'
                  )}
                  {OPTIONAL_CONTACT_FIELDS.filter(field =>
                    isContactFieldShown(contact, field.key, revealedFields)
                  ).map(field => (
                    <div key={field.key}>
                      {renderEditableField(
                        field.key,
                        field.label,
                        contact[field.key],
                        field.placeholder
                      )}
                    </div>
                  ))}
                </div>
                <AddContactFieldMenu
                  contact={contact}
                  revealedFields={revealedFields}
                  onAdd={key =>
                    setRevealedFields(previous => new Set(previous).add(key))
                  }
                />
                <ContactReachActions
                  contact={{
                    name: contactDisplayName,
                    email: contact.email,
                    phone: contact.phone,
                  }}
                  className='pt-1'
                />
              </DrawerSection>

              {/* Preferred Channel */}
              {hasEmailAndPhone && (
                <DrawerSection
                  title='Preferred Contact'
                  className='space-y-2 border-b border-subtle pb-3'
                >
                  <div className='space-y-2'>
                    <span className={CONTACT_SECTION_LABEL_CLASSNAME}>
                      Default Action
                    </span>
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
                  </div>
                </DrawerSection>
              )}
            </>
          )}

          {activeTab === 'territories' && (
            <DrawerSection title='Territories' className='space-y-2'>
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
