'use client';

/**
 * ContactSocialLinks Component
 *
 * Social links section with add/remove functionality
 */

import { Button, Input, Label } from '@jovie/ui';
import { ExternalLink, Plus, X } from 'lucide-react';
import React, { memo } from 'react';

import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import { detectPlatform } from '@/lib/utils/platform-detection';

import type { Contact, SocialLink } from './types';
import {
  extractUsernameFromLabel,
  extractUsernameFromUrl,
  formatUsername,
  isValidUrl,
} from './utils';

interface ContactSocialLinksProps {
  contact: Contact;
  fullName: string;
  isEditable: boolean;
  isAddingLink: boolean;
  newLinkUrl: string;
  onSetIsAddingLink: (value: boolean) => void;
  onSetNewLinkUrl: (value: string) => void;
  onAddLink: () => void;
  onRemoveLink: (index: number) => void;
  onNewLinkKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const ContactSocialLinks = memo(function ContactSocialLinks({
  contact,
  fullName,
  isEditable,
  isAddingLink,
  newLinkUrl,
  onSetIsAddingLink,
  onSetNewLinkUrl,
  onAddLink,
  onRemoveLink,
  onNewLinkKeyDown,
}: ContactSocialLinksProps) {
  const hasNoLinks = contact.socialLinks.length === 0 && !isAddingLink;

  return (
    <div className='space-y-2 p-3'>
      <div className='flex items-center justify-between'>
        <Label className='text-xs text-sidebar-muted'>Social links</Label>
        {isEditable && (
          <button
            type='button'
            className='p-1 rounded hover:bg-sidebar-accent transition-colors'
            aria-label='Add social link'
            onClick={() => {
              onSetIsAddingLink(true);
            }}
          >
            <Plus className='h-4 w-4' />
          </button>
        )}
      </div>

      {hasNoLinks && (
        <p className='text-xs text-sidebar-muted'>
          No social links yet.{' '}
          {isEditable ? 'Use the + button to add one.' : ''}
        </p>
      )}

      {contact.socialLinks.length > 0 && (
        <div className='flex flex-wrap gap-2 overflow-hidden py-1'>
          {contact.socialLinks.map((link: SocialLink, index: number) => {
            const username =
              extractUsernameFromUrl(link.url) ??
              extractUsernameFromLabel(link.label) ??
              '';
            const displayUsername = formatUsername(username);
            const platformId =
              link.platformType ||
              detectPlatform(link.url, fullName || contact.username).platform
                .icon;

            const ariaLabel = displayUsername
              ? `Open ${platformId} profile ${displayUsername}`
              : `Open ${platformId} link`;

            return (
              <PlatformPill
                key={link.id ?? `${link.url}-${index}`}
                platformIcon={platformId}
                platformName={platformId}
                primaryText={displayUsername || platformId}
                tone='faded'
                testId={`contact-social-pill-${platformId}-${index}`}
                onClick={() => {
                  window.open(link.url, '_blank', 'noopener,noreferrer');
                }}
                trailing={
                  <div className='flex items-center gap-1'>
                    <ExternalLink
                      className='h-3.5 w-3.5 text-tertiary-token'
                      aria-hidden
                    />
                    {isEditable && (
                      <button
                        type='button'
                        className='inline-flex h-4 w-4 items-center justify-center rounded-full text-tertiary-token hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring'
                        aria-label={`Remove ${ariaLabel}`}
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          onRemoveLink(index);
                        }}
                      >
                        <X className='h-3 w-3' aria-hidden />
                      </button>
                    )}
                  </div>
                }
                className='border-sidebar-border text-sidebar-foreground hover:bg-sidebar-surface-hover'
              />
            );
          })}
        </div>
      )}

      {isEditable && isAddingLink && (
        <div className='mt-2 space-y-2 rounded-lg border border-dashed border-sidebar-border p-3'>
          <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
            <Label className='text-xs text-sidebar-muted'>URL</Label>
            <Input
              type='url'
              value={newLinkUrl}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onSetNewLinkUrl(event.target.value)
              }
              onKeyDown={onNewLinkKeyDown}
              placeholder='https://instagram.com/username'
              inputMode='url'
              autoCapitalize='none'
              autoCorrect='off'
              autoFocus
            />
          </div>
          <div className='flex justify-end gap-2 pt-1'>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => {
                onSetIsAddingLink(false);
                onSetNewLinkUrl('');
              }}
            >
              Cancel
            </Button>
            <Button
              type='button'
              size='sm'
              variant='primary'
              onClick={onAddLink}
              disabled={!isValidUrl(newLinkUrl)}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
