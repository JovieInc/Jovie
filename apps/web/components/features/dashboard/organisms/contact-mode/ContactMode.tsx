'use client';

import {
  Badge,
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
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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

  const emailHref = contact.email ? `mailto:${contact.email}` : null;
  const phoneHref = contact.phone ? `tel:${contact.phone}` : null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <ContentSurfaceCard className='group flex items-center justify-between gap-4 px-4 py-3 transition-[background-color,border-color,box-shadow] duration-150 hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-1)'>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <p className='text-[13px] font-[510] text-(--linear-text-primary)'>
                {roleLabel}
              </p>
              {territorySummary !== 'General' && (
                <Badge size='sm'>{territorySummary}</Badge>
              )}
            </div>
            {secondaryLabel && (
              <p className='truncate text-[13px] text-(--linear-text-secondary)'>
                {secondaryLabel}
              </p>
            )}
          </div>

          {hasAnyContact && (
            <div className='flex items-center gap-1'>
              {hasEmail && (
                <Button
                  size='sm'
                  variant='ghost'
                  asChild
                  className='h-8 w-8 p-0 text-(--linear-text-tertiary) hover:bg-(--linear-bg-surface-2) hover:text-(--linear-text-primary)'
                  title={`Email ${contact.email}`}
                >
                  <a href={emailHref ?? '#'}>
                    <Mail className='h-4 w-4' />
                    <span className='sr-only'>Email</span>
                  </a>
                </Button>
              )}
              {hasPhone && (
                <Button
                  size='sm'
                  variant='ghost'
                  asChild
                  className='h-8 w-8 p-0 text-(--linear-text-tertiary) hover:bg-(--linear-bg-surface-2) hover:text-(--linear-text-primary)'
                  title={`Call ${contact.phone}`}
                >
                  <a href={phoneHref ?? '#'}>
                    <Phone className='h-4 w-4' />
                    <span className='sr-only'>Call</span>
                  </a>
                </Button>
              )}
            </div>
          )}
        </ContentSurfaceCard>
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
          <ContextMenuItem asChild>
            <a href={emailHref ?? '#'}>Send email</a>
          </ContextMenuItem>
        )}
        {hasPhone && (
          <ContextMenuItem asChild>
            <a href={phoneHref ?? '#'}>Call</a>
          </ContextMenuItem>
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
        <p className='text-(--linear-text-secondary)'>
          Unable to load contacts
        </p>
        <Button size='sm' variant='secondary' onClick={() => router.refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  if (activeContacts.length === 0) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 px-4 text-center'>
        <p className='text-(--linear-text-secondary)'>No contacts yet</p>
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
    <ContentSurfaceCard className='flex h-full flex-col overflow-hidden'>
      <ContentSectionHeader
        title='Contacts'
        subtitle={artistName}
        className='min-h-0 px-4 py-3'
      />

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

      <div className='border-t border-(--linear-app-frame-seam) p-4'>
        <Button
          size='sm'
          variant='ghost'
          onClick={() => router.push(APP_ROUTES.SETTINGS_CONTACTS)}
          className='w-full text-[13px] text-(--linear-text-secondary)'
        >
          Manage contacts
        </Button>
      </div>
    </ContentSurfaceCard>
  );
}
