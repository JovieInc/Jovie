'use client';

/**
 * ContactSocialLinks Component
 *
 * Social links section with add/remove functionality
 */

import { Button, Input, Label } from '@jovie/ui';
import { Plus } from 'lucide-react';
import React, { memo } from 'react';

import { SocialIcon } from '@/components/atoms/SocialIcon';
import { SidebarLinkRow } from '@/components/molecules/drawer';
import { detectPlatform } from '@/lib/utils/platform-detection';

import type { Contact, SocialLink } from './types';
import {
  extractUsernameFromLabel,
  extractUsernameFromUrl,
  formatUsername,
  isValidUrl,
} from './utils';

interface ContactSocialLinksProps {
  readonly contact: Contact;
  readonly fullName: string;
  readonly isEditable: boolean;
  readonly isAddingLink: boolean;
  readonly newLinkUrl: string;
  readonly onSetIsAddingLink: (value: boolean) => void;
  readonly onSetNewLinkUrl: (value: string) => void;
  readonly onAddLink: () => void;
  readonly onRemoveLink: (index: number) => void;
  readonly onNewLinkKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void;
  /** Index of the link currently being removed (for loading state) */
  readonly removingLinkIndex?: number | null;
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
  removingLinkIndex,
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
        <div className='space-y-0.5'>
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

            return (
              <SidebarLinkRow
                key={link.id ?? `${link.url}-${index}`}
                icon={<SocialIcon platform={platformId} className='h-4 w-4' />}
                label={displayUsername || platformId}
                url={link.url}
                isEditable={isEditable}
                isRemoving={removingLinkIndex === index}
                onRemove={() => onRemoveLink(index)}
                testId={`contact-social-link-${platformId}-${index}`}
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
