'use client';

import { Button } from '@jovie/ui';
import { memo } from 'react';
import { ContactItemActions } from '@/components/dashboard/atoms/ContactItemActions';
import { ContactPreferredChannel } from '@/components/dashboard/atoms/ContactPreferredChannel';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import { ContactFormFields } from '@/components/dashboard/molecules/ContactFormFields';
import { ContactRoleSelector } from '@/components/dashboard/molecules/ContactRoleSelector';
import { ContactTerritoryPicker } from '@/components/dashboard/molecules/ContactTerritoryPicker';
import {
  getContactRoleLabel,
  summarizeTerritories,
} from '@/lib/contacts/constants';
import type { ContactChannel, ContactRole } from '@/types/contacts';

function buildSummary(contact: EditableContact): string {
  const { summary } = summarizeTerritories(contact.territories);
  const roleLabel = getContactRoleLabel(contact.role, contact.customLabel);
  const secondary = [contact.personName, contact.companyName]
    .filter(Boolean)
    .join(' @ ');
  const parts = [roleLabel, secondary, summary].filter(Boolean);
  return parts.join(' – ');
}

export interface ContactItemProps {
  readonly contact: EditableContact;
  readonly onUpdate: (updates: Partial<EditableContact>) => void;
  readonly onToggleTerritory: (territory: string) => void;
  readonly onAddCustomTerritory: () => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly onDelete: () => void;
}

export const ContactItem = memo(function ContactItem({
  contact,
  onUpdate,
  onToggleTerritory,
  onAddCustomTerritory,
  onSave,
  onCancel,
  onDelete,
}: ContactItemProps) {
  const { summary: territorySummary } = summarizeTerritories(
    contact.territories
  );
  const preferredChannel = contact.preferredChannel;
  const hasEmailAndPhone = Boolean(contact.email) && Boolean(contact.phone);

  return (
    <div className='rounded-xl border border-subtle bg-surface-1 p-4 shadow-sm'>
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
            onClick={() => onUpdate({ isExpanded: !contact.isExpanded })}
          >
            {contact.isExpanded ? 'Collapse' : 'Edit'}
          </Button>
        </div>
      </div>

      {contact.isExpanded && (
        <div className='mt-4 space-y-4'>
          <ContactRoleSelector
            selectedRole={contact.role}
            customLabel={contact.customLabel}
            onRoleChange={(role: ContactRole, customLabel: string | null) =>
              onUpdate({ role, customLabel })
            }
            onCustomLabelChange={(label: string) =>
              onUpdate({ customLabel: label })
            }
          />

          <ContactFormFields
            personName={contact.personName}
            companyName={contact.companyName}
            email={contact.email}
            phone={contact.phone}
            onPersonNameChange={(value: string) =>
              onUpdate({ personName: value })
            }
            onCompanyNameChange={(value: string) =>
              onUpdate({ companyName: value })
            }
            onEmailChange={(value: string) => onUpdate({ email: value })}
            onPhoneChange={(value: string) => onUpdate({ phone: value })}
          />

          <ContactTerritoryPicker
            territories={contact.territories}
            customTerritory={contact.customTerritory ?? ''}
            territorySummary={territorySummary}
            onToggleTerritory={onToggleTerritory}
            onCustomTerritoryChange={(value: string) =>
              onUpdate({ customTerritory: value })
            }
            onAddCustomTerritory={onAddCustomTerritory}
          />

          {hasEmailAndPhone && (
            <ContactPreferredChannel
              contactId={contact.id}
              preferredChannel={preferredChannel}
              onChannelChange={(channel: ContactChannel) =>
                onUpdate({ preferredChannel: channel })
              }
            />
          )}

          {contact.error ? (
            <p className='text-sm text-error'>{contact.error}</p>
          ) : null}

          <ContactItemActions
            isSaving={contact.isSaving}
            onSave={onSave}
            onCancel={onCancel}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
});
