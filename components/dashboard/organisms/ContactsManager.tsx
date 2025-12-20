'use client';

import { Button } from '@jovie/ui';
import { useFeatureGate } from '@statsig/react-bindings';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  deleteContact,
  saveContact,
} from '@/app/app/dashboard/contacts/actions';
import { Input } from '@/components/atoms/Input';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { track } from '@/lib/analytics';
import {
  CONTACT_ROLE_OPTIONS,
  CONTACT_TERRITORY_PRESETS,
  getContactRoleLabel,
  summarizeTerritories,
} from '@/lib/contacts/constants';
import { sanitizeContactInput } from '@/lib/contacts/validation';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import type {
  ContactRole,
  DashboardContact,
  DashboardContactInput,
} from '@/types/contacts';

interface ContactsManagerProps {
  profileId: string;
  artistName: string;
  artistHandle: string;
  initialContacts: DashboardContact[];
}

type EditableContact = DashboardContact & {
  isExpanded?: boolean;
  isSaving?: boolean;
  error?: string | null;
  customTerritory?: string;
  isNew?: boolean;
};

function buildSummary(contact: DashboardContact) {
  const { summary } = summarizeTerritories(contact.territories);
  const roleLabel = getContactRoleLabel(contact.role, contact.customLabel);
  const secondary = [contact.personName, contact.companyName]
    .filter(Boolean)
    .join(' @ ');
  const parts = [roleLabel, secondary, summary].filter(Boolean);
  return parts.join(' – ');
}

function makeTempId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ContactsManager({
  profileId,
  artistName,
  artistHandle,
  initialContacts,
}: ContactsManagerProps) {
  const gate = useFeatureGate(STATSIG_FLAGS.CONTACTS);
  const featureEnabled = gate.value;
  const [contacts, setContacts] = useState<EditableContact[]>(() =>
    initialContacts.map(contact => ({
      ...contact,
      isExpanded: initialContacts.length === 1,
      customTerritory: '',
      error: null,
    }))
  );
  const [baseline, setBaseline] = useState<Record<string, DashboardContact>>(
    () =>
      initialContacts.reduce(
        (acc, contact) => ({ ...acc, [contact.id]: contact }),
        {}
      )
  );

  const hasContacts = contacts.length > 0;

  const availableRoles = useMemo(() => CONTACT_ROLE_OPTIONS, []);

  const updateContact = (
    id: string,
    updates: Partial<EditableContact>
  ): void => {
    setContacts(prev =>
      prev.map(contact =>
        contact.id === id ? { ...contact, ...updates, error: null } : contact
      )
    );
  };

  const handleToggleTerritory = (contactId: string, territory: string) => {
    setContacts(prev =>
      prev.map(contact => {
        if (contact.id !== contactId) return contact;
        const exists = contact.territories.includes(territory);
        const next = exists
          ? contact.territories.filter(t => t !== territory)
          : [...contact.territories, territory];
        try {
          const sanitized = sanitizeContactInput({
            ...contact,
            profileId,
            territories: next,
          } as DashboardContactInput);
          return { ...contact, territories: sanitized.territories };
        } catch {
          return { ...contact, territories: next };
        }
      })
    );
  };

  const addCustomTerritory = (contactId: string) => {
    const target = contacts.find(contact => contact.id === contactId);
    if (!target) return;
    const value = target.customTerritory?.trim();
    if (!value) return;
    handleToggleTerritory(contactId, value);
    updateContact(contactId, { customTerritory: '' });
  };

  const handleSave = async (contact: EditableContact) => {
    updateContact(contact.id, { isSaving: true, error: null });
    try {
      const payload: DashboardContactInput = {
        ...contact,
        id: contact.id.startsWith('temp-') ? undefined : contact.id,
        profileId,
      };
      const validated = sanitizeContactInput(payload);
      const saved = await saveContact(validated);

      setContacts(prev =>
        prev.map(item =>
          item.id === contact.id
            ? {
                ...saved,
                isExpanded: false,
                customTerritory: '',
                error: null,
                isNew: false,
              }
            : item
        )
      );
      setBaseline(prev => ({ ...prev, [saved.id]: saved }));
      toast.success('Contact saved');
      track(
        contact.id && !contact.id.startsWith('temp-')
          ? 'contacts_contact_updated'
          : 'contacts_contact_created',
        {
          handle: artistHandle,
          role: saved.role,
          territory_count: saved.territories.length,
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save contact';
      updateContact(contact.id, { error: message });
      toast.error(message);
    } finally {
      updateContact(contact.id, { isSaving: false });
    }
  };

  const handleDelete = async (contact: EditableContact) => {
    if (!contact.id || contact.id.startsWith('temp-')) {
      setContacts(prev => prev.filter(item => item.id !== contact.id));
      return;
    }

    const confirmed = window.confirm('Remove this contact from your profile?');
    if (!confirmed) return;

    updateContact(contact.id, { isSaving: true });
    try {
      await deleteContact(contact.id, profileId);
      setContacts(prev => prev.filter(item => item.id !== contact.id));
      setBaseline(prev => {
        const next = { ...prev };
        delete next[contact.id];
        return next;
      });
      toast.success('Contact removed');
      track('contacts_contact_deleted', {
        handle: artistHandle,
        role: contact.role,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to delete contact';
      toast.error(message);
      updateContact(contact.id, { isSaving: false, error: message });
    }
  };

  const handleCancel = (contact: EditableContact) => {
    if (!contact.id || contact.id.startsWith('temp-')) {
      setContacts(prev => prev.filter(item => item.id !== contact.id));
      return;
    }
    const baselineContact = baseline[contact.id];
    if (!baselineContact) return;
    setContacts(prev =>
      prev.map(item =>
        item.id === contact.id
          ? {
              ...baselineContact,
              isExpanded: false,
              customTerritory: '',
            }
          : item
      )
    );
  };

  const addContact = (role: ContactRole = 'bookings') => {
    const newContact: EditableContact = {
      id: `temp-${makeTempId()}`,
      creatorProfileId: profileId,
      role,
      customLabel: role === 'other' ? '' : null,
      personName: '',
      companyName: '',
      territories: [],
      email: '',
      phone: '',
      preferredChannel: null,
      isActive: true,
      sortOrder: contacts.length,
      isExpanded: true,
      isNew: true,
      customTerritory: '',
      error: null,
    };
    setContacts(prev => [...prev, newContact]);
  };

  if (!featureEnabled) {
    return (
      <DashboardCard variant='settings'>
        <h1 className='text-xl font-semibold text-primary-token'>
          Contacts coming soon
        </h1>
        <p className='text-secondary-token mt-1'>
          This workspace does not have the contacts preview enabled yet.
        </p>
      </DashboardCard>
    );
  }

  return (
    <div className='space-y-4' data-testid='contacts-manager'>
      <div className='space-y-1'>
        <h1 className='text-2xl font-semibold text-primary-token'>Contacts</h1>
        <p className='text-secondary-token'>
          Add bookings, management, and press contacts so fans and industry know
          who to reach for {artistName}.
        </p>
      </div>

      {!hasContacts && (
        <DashboardCard variant='empty-state'>
          <div className='space-y-3'>
            <p className='text-secondary-token'>
              Get started with your first contact.
            </p>
            <div className='flex flex-wrap gap-2'>
              <Button size='sm' onClick={() => addContact('bookings')}>
                Add bookings contact
              </Button>
              <Button
                size='sm'
                variant='secondary'
                onClick={() => addContact('management')}
              >
                Add management contact
              </Button>
            </div>
          </div>
        </DashboardCard>
      )}

      {hasContacts && (
        <div className='space-y-3'>
          {contacts.map(contact => {
            const { summary } = summarizeTerritories(contact.territories);
            const preferredChannel = contact.preferredChannel;

            return (
              <div
                key={contact.id}
                className='rounded-xl border border-subtle bg-surface-1 p-4 shadow-sm'
              >
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <p className='text-sm font-semibold text-primary-token'>
                      {buildSummary(contact)}
                    </p>
                    <p className='text-xs text-secondary-token'>
                      {preferredChannel
                        ? `Default action: ${preferredChannel}`
                        : 'Select a default action'}
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() =>
                        updateContact(contact.id, {
                          isExpanded: !contact.isExpanded,
                        })
                      }
                    >
                      {contact.isExpanded ? 'Collapse' : 'Edit'}
                    </Button>
                  </div>
                </div>

                {contact.isExpanded && (
                  <div className='mt-4 space-y-4'>
                    <div className='space-y-2'>
                      <p className='text-xs font-semibold text-secondary-token uppercase'>
                        Role
                      </p>
                      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                        {availableRoles.map(option => (
                          <Button
                            key={option.value}
                            type='button'
                            size='sm'
                            variant={
                              contact.role === option.value
                                ? 'primary'
                                : 'secondary'
                            }
                            className='justify-start'
                            onClick={() =>
                              updateContact(contact.id, {
                                role: option.value,
                                customLabel:
                                  option.value === 'other'
                                    ? (contact.customLabel ?? '')
                                    : null,
                              })
                            }
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                      {contact.role === 'other' && (
                        <Input
                          label='Contact label'
                          placeholder='Sync & Licensing'
                          value={contact.customLabel ?? ''}
                          onChange={event =>
                            updateContact(contact.id, {
                              customLabel: event.target.value,
                            })
                          }
                        />
                      )}
                    </div>

                    <div className='grid gap-3 md:grid-cols-2'>
                      <Input
                        label='Person name'
                        placeholder='Sarah Lee'
                        value={contact.personName ?? ''}
                        onChange={event =>
                          updateContact(contact.id, {
                            personName: event.target.value,
                          })
                        }
                      />
                      <Input
                        label='Company / agency'
                        placeholder='XYZ Agency'
                        value={contact.companyName ?? ''}
                        onChange={event =>
                          updateContact(contact.id, {
                            companyName: event.target.value,
                          })
                        }
                      />
                    </div>

                    <div className='space-y-2'>
                      <p className='text-xs font-semibold text-secondary-token uppercase'>
                        Territories
                      </p>
                      <div className='flex flex-wrap gap-2'>
                        {CONTACT_TERRITORY_PRESETS.map(territory => (
                          <Button
                            key={territory}
                            type='button'
                            size='sm'
                            variant={
                              contact.territories.includes(territory)
                                ? 'primary'
                                : 'secondary'
                            }
                            onClick={() =>
                              handleToggleTerritory(contact.id, territory)
                            }
                          >
                            {territory}
                          </Button>
                        ))}
                        <div className='flex items-center gap-2'>
                          <Input
                            placeholder='Add custom territory'
                            value={contact.customTerritory ?? ''}
                            onChange={event =>
                              updateContact(contact.id, {
                                customTerritory: event.target.value,
                              })
                            }
                          />
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => addCustomTerritory(contact.id)}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                      <p className='text-xs text-secondary-token'>
                        {summary === 'General'
                          ? 'Add a region to speed up routing'
                          : summary}
                      </p>
                    </div>

                    <div className='grid gap-3 md:grid-cols-2'>
                      <Input
                        label='Email'
                        type='email'
                        placeholder='bookings@agency.com'
                        value={contact.email ?? ''}
                        onChange={event =>
                          updateContact(contact.id, {
                            email: event.target.value,
                          })
                        }
                      />
                      <Input
                        label='Phone'
                        type='tel'
                        placeholder='+1 555 123 4567'
                        value={contact.phone ?? ''}
                        onChange={event =>
                          updateContact(contact.id, {
                            phone: event.target.value,
                          })
                        }
                      />
                    </div>

                    {contact.email && contact.phone && (
                      <div className='space-y-2'>
                        <p className='text-xs font-semibold text-secondary-token uppercase'>
                          Default action
                        </p>
                        <div className='flex flex-wrap gap-4'>
                          <label className='flex items-center gap-2 text-sm text-secondary-token'>
                            <input
                              type='radio'
                              name={`preferred-${contact.id}`}
                              value='email'
                              checked={
                                (contact.preferredChannel ?? 'email') ===
                                'email'
                              }
                              onChange={() =>
                                updateContact(contact.id, {
                                  preferredChannel: 'email',
                                })
                              }
                            />
                            Email
                          </label>
                          <label className='flex items-center gap-2 text-sm text-secondary-token'>
                            <input
                              type='radio'
                              name={`preferred-${contact.id}`}
                              value='phone'
                              checked={contact.preferredChannel === 'phone'}
                              onChange={() =>
                                updateContact(contact.id, {
                                  preferredChannel: 'phone',
                                })
                              }
                            />
                            Phone
                          </label>
                        </div>
                      </div>
                    )}

                    {contact.error ? (
                      <p className='text-sm text-red-600'>{contact.error}</p>
                    ) : null}

                    <div className='flex flex-wrap gap-3'>
                      <Button
                        size='sm'
                        onClick={() => handleSave(contact)}
                        disabled={contact.isSaving}
                      >
                        {contact.isSaving ? 'Saving…' : 'Save'}
                      </Button>
                      <Button
                        size='sm'
                        variant='secondary'
                        onClick={() => handleCancel(contact)}
                        disabled={contact.isSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => handleDelete(contact)}
                        disabled={contact.isSaving}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <Button variant='primary' onClick={() => addContact()}>
          Add contact
        </Button>
      </div>
    </div>
  );
}
