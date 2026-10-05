'use client';

import type { LucideIcon } from 'lucide-react';
import {
  CalendarPlus,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
} from 'lucide-react';
import { DRAWER_CARD_ACTION_BUTTON_CLASSNAME } from '@/components/molecules/drawer/DrawerCardActionBar';
import { cn } from '@/lib/utils';

export interface ContactReachTarget {
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
}

export interface ContactReachAction {
  readonly id: 'email' | 'call' | 'text' | 'whatsapp' | 'book';
  readonly label: string;
  readonly icon: LucideIcon;
  /** Present when the contact has the data this action needs. */
  readonly href: string | null;
  /** Why the action is unavailable; shown when href is null. */
  readonly missingReason: string;
  readonly external?: boolean;
}

/**
 * Real ways to reach a contact, built only from data on the contact. WhatsApp
 * needs an international number (leading +) so it never guesses a country.
 */
export function buildContactReachActions(
  contact: ContactReachTarget
): ContactReachAction[] {
  const email = contact.email?.trim() || null;
  const phone = contact.phone?.trim() || null;
  const dialable = phone ? phone.replace(/[^\d+]/g, '') : null;
  const international = dialable?.startsWith('+') ? dialable.slice(1) : null;
  const calendar = email
    ? `https://calendar.google.com/calendar/render?${new URLSearchParams({
        action: 'TEMPLATE',
        text: `Me <> ${contact.name}`,
        add: email,
      }).toString()}`
    : null;

  return [
    {
      id: 'email',
      label: 'Email',
      icon: Mail,
      href: email ? `mailto:${email}` : null,
      missingReason: 'Add an email to send one',
    },
    {
      id: 'call',
      label: 'Call',
      icon: Phone,
      href: dialable ? `tel:${dialable}` : null,
      missingReason: 'Add a phone number to call',
    },
    {
      id: 'text',
      label: 'Text',
      icon: MessageSquare,
      href: dialable ? `sms:${dialable}` : null,
      missingReason: 'Add a phone number to text',
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: MessageCircle,
      href: international ? `https://wa.me/${international}` : null,
      missingReason: 'Add a number with a country code, like +44',
      external: true,
    },
    {
      id: 'book',
      label: 'Book Call',
      icon: CalendarPlus,
      href: calendar,
      missingReason: 'Add an email to send an invite',
      external: true,
    },
  ];
}

export function ContactReachActions({
  contact,
  className,
}: Readonly<{ contact: ContactReachTarget; className?: string }>) {
  const actions = buildContactReachActions(contact);
  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      data-testid='contact-reach-actions'
    >
      {actions.map(action => {
        const Icon = action.icon;
        const content = (
          <>
            <Icon aria-hidden='true' />
            <span>{action.label}</span>
          </>
        );
        if (!action.href) {
          return (
            <span
              key={action.id}
              role='link'
              aria-disabled='true'
              aria-label={`${action.label}: ${action.missingReason}`}
              title={action.missingReason}
              className={cn(
                DRAWER_CARD_ACTION_BUTTON_CLASSNAME,
                'cursor-not-allowed text-tertiary-token opacity-60 hover:border-subtle hover:bg-surface-1 hover:text-tertiary-token'
              )}
            >
              {content}
            </span>
          );
        }
        return (
          <a
            key={action.id}
            href={action.href}
            {...(action.external
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
            className={DRAWER_CARD_ACTION_BUTTON_CLASSNAME}
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}
