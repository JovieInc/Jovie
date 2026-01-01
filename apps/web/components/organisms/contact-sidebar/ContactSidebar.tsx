'use client';

/**
 * ContactSidebar Component
 *
 * A sidebar component for displaying and editing contact details,
 * including avatar, name, username, and social links.
 */

import { Button, Input, Label } from '@jovie/ui';
import { Copy, ExternalLink, Plus, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';
import React, { useCallback, useMemo, useState } from 'react';

import { Avatar } from '@/components/atoms/Avatar';
import { HeaderIconButton } from '@/components/atoms/HeaderIconButton';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { detectPlatform } from '@/lib/utils/platform-detection';
import type { Contact, ContactSocialLink } from '@/types';

import type { ContactSidebarProps } from './types';
import {
  extractUsernameFromLabel,
  extractUsernameFromUrl,
  formatUsername,
  isFormElement,
  isValidUrl,
  sanitizeUsernameInput,
} from './utils';

export function ContactSidebar({
  contact,
  mode,
  isOpen,
  onClose,
  onRefresh,
  onContactChange,
  onSave,
  isSaving,
  onAvatarUpload,
}: ContactSidebarProps) {
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');

  const isEditable = mode === 'admin';
  const hasContact = Boolean(contact);

  const fullName = useMemo(() => {
    if (!contact) return '';
    const parts = [contact.firstName, contact.lastName]
      .filter(Boolean)
      .join(' ');
    return parts || contact.displayName || contact.username;
  }, [contact]);

  const handleFieldChange = useCallback(
    (updater: (current: Contact) => Contact) => {
      if (!contact || !onContactChange) return;
      onContactChange(updater(contact));
    },
    [contact, onContactChange]
  );

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      if (!contact || !onAvatarUpload || !onContactChange) {
        return contact?.avatarUrl ?? '';
      }
      track('contact_avatar_upload_start', { contactId: contact.id });
      const newUrl = await onAvatarUpload(file, contact);
      onContactChange({ ...contact, avatarUrl: newUrl });
      track('contact_avatar_upload_success', { contactId: contact.id });
      return newUrl;
    },
    [contact, onAvatarUpload, onContactChange]
  );

  const handleCopyProfileUrl = useCallback(async () => {
    if (!contact?.username) return;
    try {
      const url = new URL(
        `/${contact.username}`,
        window.location.origin
      ).toString();
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error('Failed to copy profile URL', error);
    }
  }, [contact]);

  const handleNameChange = (field: 'firstName' | 'lastName', value: string) => {
    handleFieldChange(current => ({ ...current, [field]: value }));
  };

  const handleUsernameChange = (raw: string) => {
    const username = sanitizeUsernameInput(raw);
    handleFieldChange(current => ({ ...current, username }));
  };

  const handleAddLink = () => {
    if (!contact || !onContactChange) return;
    const trimmedUrl = newLinkUrl.trim();
    if (!isValidUrl(trimmedUrl)) return;

    const detected = detectPlatform(trimmedUrl, fullName || contact.username);
    if (!detected.isValid) return;

    const nextLink: ContactSocialLink = {
      id: undefined,
      label: detected.suggestedTitle,
      url: detected.normalizedUrl,
      platformType: detected.platform.icon,
    };

    onContactChange({
      ...contact,
      socialLinks: [...contact.socialLinks, nextLink],
    });

    setIsAddingLink(false);
    setNewLinkUrl('');
  };

  const handleRemoveLink = (index: number) => {
    handleFieldChange(current => ({
      ...current,
      socialLinks: current.socialLinks.filter((_link, i) => i !== index),
    }));
  };

  const handleNewLinkKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (isValidUrl(newLinkUrl)) {
        handleAddLink();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsAddingLink(false);
      setNewLinkUrl('');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !isFormElement(event.target)) {
      onClose?.();
    }
  };

  const canUploadAvatar =
    isEditable && Boolean(onAvatarUpload && contact && onContactChange);

  return (
    <aside
      aria-label='Contact details'
      aria-hidden={!isOpen}
      data-testid='contact-sidebar'
      className={cn(
        'relative flex h-full min-h-screen flex-col bg-surface-0 text-sidebar-foreground border-l border-subtle transition-[width,opacity,transform] duration-200 ease-out overflow-hidden',
        'w-0 opacity-0 translate-x-4 pointer-events-none',
        isOpen &&
          'pointer-events-auto w-full opacity-100 translate-x-0 md:w-[300px] lg:w-[320px]'
      )}
      onKeyDown={handleKeyDown}
    >
      <div className='flex items-center justify-between border-b border-sidebar-border px-3 py-2'>
        <p className='text-xs text-sidebar-muted'>
          {hasContact ? `ID: ${contact?.id}` : 'No contact selected'}
        </p>
        <div className='flex items-center gap-1'>
          {hasContact && contact?.username && (
            <HeaderIconButton
              size='xs'
              ariaLabel='Copy profile link'
              onClick={handleCopyProfileUrl}
              className='text-secondary-token hover:text-primary-token transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-sidebar-ring'
            >
              <Copy className='h-4 w-4' aria-hidden />
            </HeaderIconButton>
          )}
          {hasContact && contact?.username && (
            <HeaderIconButton
              size='xs'
              ariaLabel='Refresh profile'
              onClick={() => {
                if (onRefresh) {
                  onRefresh();
                  return;
                }
                window.location.reload();
              }}
              className='text-secondary-token hover:text-primary-token transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-sidebar-ring'
            >
              <RefreshCw className='h-4 w-4' aria-hidden />
            </HeaderIconButton>
          )}
          {hasContact && contact?.username && (
            <HeaderIconButton
              size='xs'
              ariaLabel='Open profile'
              asChild
              className='text-secondary-token hover:text-primary-token transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-sidebar-ring'
            >
              <Link
                href={`/${contact.username}`}
                target='_blank'
                rel='noopener noreferrer'
              >
                <ExternalLink className='h-4 w-4' aria-hidden />
              </Link>
            </HeaderIconButton>
          )}
          {onClose && (
            <HeaderIconButton
              size='xs'
              ariaLabel='Close contact sidebar'
              onClick={onClose}
              className='text-secondary-token hover:text-primary-token transition-transform duration-150 ease-out hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-sidebar-ring'
            >
              <X className='h-4 w-4' aria-hidden='true' />
            </HeaderIconButton>
          )}
        </div>
      </div>

      <div className='flex-1 space-y-6 overflow-auto px-4 py-4'>
        {!contact ? (
          <p className='text-xs text-sidebar-muted'>
            Select a row in the table and press Space to view contact details.
          </p>
        ) : (
          <>
            {/* Avatar section */}
            <div
              className='flex items-center gap-3'
              data-testid='contact-avatar'
            >
              {canUploadAvatar ? (
                <AvatarUploadable
                  src={contact.avatarUrl ?? null}
                  alt={fullName ? `${fullName}'s avatar` : 'Contact avatar'}
                  name={fullName || contact.username}
                  size='lg'
                  uploadable={canUploadAvatar}
                  onUpload={canUploadAvatar ? handleAvatarUpload : undefined}
                  showHoverOverlay
                />
              ) : (
                <Avatar
                  src={contact.avatarUrl ?? null}
                  alt={fullName ? `${fullName}'s avatar` : 'Contact avatar'}
                  name={fullName || contact.username}
                  size='lg'
                />
              )}
              <div className='min-w-0 flex-1'>
                <div className='text-sm font-medium truncate'>{fullName}</div>
                <div className='text-xs text-sidebar-muted truncate'>
                  {formatUsername(contact.username) || 'No username'}
                </div>
              </div>
            </div>

            {/* Name and username fields */}
            <div className='space-y-3'>
              <div className='grid grid-cols-[96px,minmax(0,1fr)] items-start gap-2'>
                <Label className='text-xs text-sidebar-muted pt-2'>Name</Label>
                {isEditable ? (
                  <div className='grid grid-cols-2 gap-2 min-w-0'>
                    <div className='min-w-0'>
                      <Label className='sr-only'>First name</Label>
                      <Input
                        value={contact.firstName ?? ''}
                        onChange={(
                          event: React.ChangeEvent<HTMLInputElement>
                        ) => handleNameChange('firstName', event.target.value)}
                        placeholder='First'
                      />
                    </div>
                    <div className='min-w-0'>
                      <Label className='sr-only'>Last name</Label>
                      <Input
                        value={contact.lastName ?? ''}
                        onChange={(
                          event: React.ChangeEvent<HTMLInputElement>
                        ) => handleNameChange('lastName', event.target.value)}
                        placeholder='Last'
                      />
                    </div>
                  </div>
                ) : (
                  <div className='min-h-9 flex items-center text-sm'>
                    {contact.firstName || contact.lastName ? (
                      <span>
                        {[contact.firstName, contact.lastName]
                          .filter(Boolean)
                          .join(' ')}
                      </span>
                    ) : (
                      <span className='text-sidebar-muted italic'>
                        Not provided
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
                <Label className='text-xs text-sidebar-muted'>Username</Label>
                {isEditable ? (
                  <Input
                    value={formatUsername(contact.username)}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                      handleUsernameChange(event.target.value)
                    }
                    placeholder='@username'
                  />
                ) : (
                  <div className='min-h-9 flex items-center text-sm'>
                    {contact.username ? (
                      <span>{formatUsername(contact.username)}</span>
                    ) : (
                      <span className='text-sidebar-muted italic'>
                        Not provided
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Social links */}
            <div className='space-y-2 bg-sidebar-surface border border-sidebar-border p-3'>
              <div className='flex items-center justify-between'>
                <Label className='text-xs text-sidebar-muted'>
                  Social links
                </Label>
                {isEditable && (
                  <Button
                    type='button'
                    size='icon'
                    variant='ghost'
                    aria-label='Add social link'
                    onClick={() => {
                      setIsAddingLink(true);
                      setTimeout(() => {
                        // focus handled by browser via autoFocus below
                      }, 0);
                    }}
                  >
                    <Plus className='h-4 w-4' />
                  </Button>
                )}
              </div>

              {contact.socialLinks.length === 0 && !isAddingLink ? (
                <p className='text-xs text-sidebar-muted'>
                  No social links yet.{' '}
                  {isEditable ? 'Use the + button to add one.' : ''}
                </p>
              ) : null}

              {contact.socialLinks.length > 0 && (
                <div className='flex flex-wrap gap-2'>
                  {contact.socialLinks.map((link, index) => {
                    const username =
                      extractUsernameFromUrl(link.url) ??
                      extractUsernameFromLabel(link.label) ??
                      '';
                    const displayUsername = formatUsername(username);
                    const platformId =
                      (link.platformType as string | undefined) ||
                      detectPlatform(link.url, fullName || contact.username)
                        .platform.icon;

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
                          window.open(
                            link.url,
                            '_blank',
                            'noopener,noreferrer'
                          );
                        }}
                        trailing={
                          <div className='flex items-center gap-1'>
                            <ExternalLink
                              className='h-3.5 w-3.5 text-tertiary-token'
                              aria-hidden
                            />
                            {isEditable ? (
                              <button
                                type='button'
                                className='inline-flex h-4 w-4 items-center justify-center rounded-full text-tertiary-token hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring'
                                aria-label={`Remove ${ariaLabel}`}
                                onClick={event => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleRemoveLink(index);
                                }}
                              >
                                <X className='h-3 w-3' aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        }
                        className='border-sidebar-border bg-sidebar-surface text-sidebar-foreground hover:bg-sidebar-surface-hover'
                      />
                    );
                  })}
                </div>
              )}

              {isEditable && isAddingLink && (
                <div className='mt-2 space-y-2 rounded-lg border border-dashed border-sidebar-border bg-sidebar-surface p-3'>
                  <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
                    <Label className='text-xs text-sidebar-muted'>URL</Label>
                    <Input
                      type='url'
                      value={newLinkUrl}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setNewLinkUrl(event.target.value)
                      }
                      onKeyDown={handleNewLinkKeyDown}
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
                        setIsAddingLink(false);
                        setNewLinkUrl('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='primary'
                      onClick={handleAddLink}
                      disabled={!isValidUrl(newLinkUrl)}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {isEditable && onSave && contact && (
              <div className='pt-2 flex justify-end'>
                <Button
                  type='button'
                  size='sm'
                  variant='primary'
                  onClick={() => onSave(contact)}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
