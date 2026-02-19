'use client';

import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@jovie/ui';
import { Mail, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { APP_ROUTES } from '@/constants/routes';
import {
  getContactRoleLabel,
  summarizeTerritories,
} from '@/lib/contacts/constants';
import type { DashboardContact } from '@/types/contacts';

export interface ContactModeProps {
  readonly artistName: string;
  readonly contacts: DashboardContact[];
  readonly hasError?: boolean;
}

interface ContactListItemProps {
  readonly contact: DashboardContact;
  readonly onCopyEmail: (email: string) => void;
  readonly onCopyPhone: (phone: string) => void;
}

function ContactListItem({
  contact,
  onCopyEmail,
  onCopyPhone,
}: ContactListItemProps) {
  const roleLabel = getContactRoleLabel(contact.role, contact.customLabel);
  const { summary: territorySummary } = summarizeTerritories(
    contact.territories
  );

  const secondaryLabel = [contact.personName, contact.companyName]
    .filter(Boolean)
    .join(' @ ');

  const hasEmail = Boolean(contact.email);
  const hasPhone = Boolean(contact.phone);
  const hasAnyContact = hasEmail || hasPhone;

  const handleEmailClick = useCallback(() => {
    if (contact.email) {
      globalThis.location.href = `mailto:${contact.email}`;
    }
  }, [contact.email]);

  const handlePhoneClick = useCallback(() => {
    if (contact.phone) {
      globalThis.location.href = `tel:${contact.phone}`;
    }
  }, [contact.phone]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className='group flex items-center justify-between gap-4 rounded-lg border border-subtle bg-surface-1 px-4 py-3 transition-colors hover:bg-surface-2'>
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-medium text-primary-token'>
              {roleLabel}
            </p>
            {(secondaryLabel || territorySummary !== 'General') && (
              <p className='truncate text-xs text-secondary-token'>
                {[
                  secondaryLabel,
                  territorySummary !== 'General' && territorySummary,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>

          {hasAnyContact && (
            <div className='flex items-center gap-1'>
              {hasEmail && (
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={handleEmailClick}
                  className='h-8 w-8 p-0'
                  title={`Email ${contact.email}`}
                >
                  <Mail className='h-4 w-4' />
                  <span className='sr-only'>Email</span>
                </Button>
              )}
              {hasPhone && (
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={handlePhoneClick}
                  className='h-8 w-8 p-0'
                  title={`Call ${contact.phone}`}
                >
                  <Phone className='h-4 w-4' />
                  <span className='sr-only'>Call</span>
                </Button>
              )}
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        {hasEmail && (
          <ContextMenuItem onClick={() => onCopyEmail(contact.email!)}>
            Copy email
          </ContextMenuItem>
        )}
        {hasPhone && (
          <ContextMenuItem onClick={() => onCopyPhone(contact.phone!)}>
            Copy phone
          </ContextMenuItem>
        )}
        {hasEmail && hasPhone && <ContextMenuSeparator />}
        {hasEmail && (
          <ContextMenuItem onClick={handleEmailClick}>
            Send email
          </ContextMenuItem>
        )}
        {hasPhone && (
          <ContextMenuItem onClick={handlePhoneClick}>Call</ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function ContactMode({
  artistName,
  contacts,
  hasError,
}: ContactModeProps) {
  const router = useRouter();

  const activeContacts = contacts.filter(c => c.isActive);

  const handleCopyEmail = useCallback(async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success('Email copied', { duration: 2000 });
    } catch {
      toast.error('Failed to copy');
    }
  }, []);

  const handleCopyPhone = useCallback(async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success('Phone copied', { duration: 2000 });
    } catch {
      toast.error('Failed to copy');
    }
  }, []);

  if (hasError) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 px-4 text-center'>
        <p className='text-secondary-token'>Unable to load contacts</p>
        <Button size='sm' variant='secondary' onClick={() => router.refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  if (activeContacts.length === 0) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 px-4 text-center'>
        <p className='text-secondary-token'>No contacts yet</p>
        <Button
          size='sm'
          variant='secondary'
          onClick={() => router.push(APP_ROUTES.SETTINGS_CONTACTS)}
        >
          Add contacts
        </Button>
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col'>
      <div className='border-b border-subtle px-4 py-3'>
        <h1 className='text-sm font-semibold text-primary-token'>Contacts</h1>
        <p className='text-xs text-secondary-token'>{artistName}</p>
      </div>

      <div className='flex-1 overflow-y-auto'>
        <div className='space-y-2 p-4'>
          {activeContacts.map(contact => (
            <ContactListItem
              key={contact.id}
              contact={contact}
              onCopyEmail={handleCopyEmail}
              onCopyPhone={handleCopyPhone}
            />
          ))}
        </div>
      </div>

      <div className='border-t border-subtle p-4'>
        <Button
          size='sm'
          variant='ghost'
          onClick={() => router.push(APP_ROUTES.SETTINGS_CONTACTS)}
          className='w-full text-xs text-secondary-token'
        >
          Manage contacts
        </Button>
      </div>
    </div>
  );
}
