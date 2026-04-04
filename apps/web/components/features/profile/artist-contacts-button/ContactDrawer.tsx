'use client';

import { motion } from 'motion/react';
import { useCallback, useEffect } from 'react';
import { track } from '@/lib/analytics';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import { ProfileDrawerShell } from '../ProfileDrawerShell';
import { useArtistContacts } from './useArtistContacts';

const MAX_STAGGER = 6;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.25,
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.04,
      delayChildren: 0.08,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
} as const;

interface ContactDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly contacts: PublicContact[];
  readonly primaryChannel: (contact: PublicContact) => PublicContactChannel;
}

export function ContactDrawer({
  open,
  onOpenChange,
  artistName,
  artistHandle,
  contacts,
  primaryChannel,
}: ContactDrawerProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;

    track('contacts_drawer_open', {
      handle: artistHandle,
      contacts_count: contacts.length,
    });

    return undefined;
  }, [open, artistHandle, contacts.length]);

  const { getActionHref, trackAction } = useArtistContacts({
    contacts,
    artistHandle,
  });

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      onOpenChange(isOpen);
    },
    [onOpenChange]
  );

  const MotionContainer = prefersReducedMotion ? 'div' : motion.div;
  const MotionItem = prefersReducedMotion ? 'div' : motion.div;

  const channelLabels: Record<string, string> = {
    email: 'Email',
    sms: 'Text',
    phone: 'Call',
  };

  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={handleOpenChange}
      title='Get in touch'
      dataTestId='contact-drawer'
    >
      <MotionContainer
        className='space-y-4'
        {...(prefersReducedMotion
          ? {}
          : {
              variants: containerVariants,
              initial: 'hidden',
              animate: 'visible',
            })}
      >
        {contacts.map((contact, index) => (
          <MotionItem
            key={contact.id}
            {...(prefersReducedMotion
              ? {}
              : {
                  variants: itemVariants,
                  style:
                    index >= MAX_STAGGER
                      ? { transitionDelay: `${MAX_STAGGER * 0.04 + 0.08}s` }
                      : undefined,
                })}
          >
            <div data-testid='contact-drawer-item'>
              <div className='flex items-baseline justify-between gap-2'>
                <span className='text-[13px] font-[510] uppercase tracking-wider text-white'>
                  {contact.roleLabel}
                </span>
                {contact.territorySummary ? (
                  <span className='text-[13px] text-white/40'>
                    {contact.territorySummary}
                  </span>
                ) : null}
              </div>
              {contact.secondaryLabel || contact.primaryContactLabel ? (
                <p className='mt-1 text-[14px] text-white/50'>
                  {contact.primaryContactLabel ?? contact.secondaryLabel}
                </p>
              ) : null}
              <div className='mt-3 flex gap-2'>
                {contact.channels.map(channel => {
                  const channelHref = getActionHref(channel);
                  if (!channelHref) return null;

                  const label = channelLabels[channel.type] ?? channel.type;

                  return (
                    <a
                      key={`${contact.id}-${channel.type}`}
                      href={channelHref}
                      className='inline-flex min-h-[44px] items-center justify-center rounded-full bg-white/[0.08] px-4 py-2 text-[13px] font-[450] text-white transition-colors active:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                      aria-label={`${label} ${contact.roleLabel}`}
                      onClick={() => trackAction(channel, contact)}
                      data-testid='contact-drawer-channel-action'
                    >
                      {label}
                    </a>
                  );
                })}
              </div>
            </div>
          </MotionItem>
        ))}
      </MotionContainer>
    </ProfileDrawerShell>
  );
}
