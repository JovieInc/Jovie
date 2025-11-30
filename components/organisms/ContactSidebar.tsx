'use client';

import { Button, Input, Label } from '@jovie/ui';
import { ExternalLink, Plus, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

import { Avatar } from '@/components/atoms/Avatar';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { AvatarUploadable } from '@/components/molecules/AvatarUploadable';
import { cn } from '@/lib/utils';
import type { Contact, ContactSidebarMode, ContactSocialLink } from '@/types';

export interface ContactSidebarProps {
  contact: Contact | null;
  mode: ContactSidebarMode;
  isOpen: boolean;
  onClose?: () => void;
  onContactChange?: (contact: Contact) => void;
  onSave?: (contact: Contact) => void | Promise<void>;
  isSaving?: boolean;
  /**
   * Optional avatar upload handler. When provided and mode === 'admin',
   * the avatar becomes uploadable and this callback is used to obtain
   * the new avatar URL. The updated URL will be merged into the contact
   * and emitted via onContactChange.
   */
  onAvatarUpload?: (file: File, contact: Contact) => Promise<string>;
}

function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'BUTTON'
  );
}

function formatUsername(username: string | undefined): string {
  if (!username) return '';
  return username.startsWith('@') ? username : `@${username}`;
}

function sanitizeUsernameInput(raw: string): string {
  const trimmed = raw.trim();
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return withoutAt;
}

function isValidUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const protocol = url.protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function ContactSidebar({
  contact,
  mode,
  isOpen,
  onClose,
  onContactChange,
  onSave,
  isSaving,
  onAvatarUpload,
}: ContactSidebarProps) {
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState('');
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
      const newUrl = await onAvatarUpload(file, contact);
      onContactChange({ ...contact, avatarUrl: newUrl });
      return newUrl;
    },
    [contact, onAvatarUpload, onContactChange]
  );

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

    const label = newLinkLabel.trim() || trimmedUrl.replace(/^https?:\/\//, '');

    const nextLink: ContactSocialLink = {
      id: undefined,
      label,
      url: trimmedUrl,
    };

    onContactChange({
      ...contact,
      socialLinks: [...contact.socialLinks, nextLink],
    });

    setIsAddingLink(false);
    setNewLinkLabel('');
    setNewLinkUrl('');
  };

  const handleRemoveLink = (index: number) => {
    handleFieldChange(current => ({
      ...current,
      socialLinks: current.socialLinks.filter((_, i) => i !== index),
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
      setNewLinkLabel('');
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
      className={cn(
        'relative flex h-full flex-col border-l border-subtle bg-surface-1/80 text-sm text-primary-token shadow-sm transition-[width,opacity,transform] duration-200 ease-out overflow-hidden',
        'w-0 opacity-0 translate-x-4 pointer-events-none',
        isOpen &&
          'pointer-events-auto w-full opacity-100 translate-x-0 md:w-[340px] lg:w-[360px]'
      )}
      onKeyDown={handleKeyDown}
      role='complementary'
    >
      <div className='flex items-start justify-between border-b border-subtle px-4 py-3'>
        <div>
          <p className='text-xs uppercase tracking-wide text-tertiary-token'>
            Contact
          </p>
          <h2 className='text-sm font-semibold text-primary-token'>
            {hasContact ? fullName || 'Unnamed contact' : 'No contact selected'}
          </h2>
        </div>
        {onClose && (
          <Button
            type='button'
            size='icon'
            variant='ghost'
            aria-label='Close contact sidebar'
            onClick={onClose}
          >
            <X className='h-4 w-4' />
          </Button>
        )}
      </div>

      <div className='flex-1 space-y-6 overflow-auto px-4 py-4'>
        {!contact ? (
          <p className='text-xs text-secondary-token'>
            Select a row in the table and press Space to view contact details.
          </p>
        ) : (
          <>
            {/* Avatar section */}
            <div className='flex items-center gap-3'>
              {canUploadAvatar ? (
                <AvatarUploadable
                  src={contact.avatarUrl ?? null}
                  alt={fullName ? `${fullName}'s avatar` : 'Contact avatar'}
                  name={fullName || contact.username}
                  size='lg'
                  uploadable
                  onUpload={handleAvatarUpload}
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
                <div className='text-xs text-secondary-token truncate'>
                  {formatUsername(contact.username) || 'No username'}
                </div>
              </div>
            </div>

            {/* Name and username fields */}
            <div className='space-y-3'>
              <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
                <Label className='text-xs text-tertiary-token'>
                  First name
                </Label>
                {isEditable ? (
                  <Input
                    value={contact.firstName ?? ''}
                    onChange={event =>
                      handleNameChange('firstName', event.target.value)
                    }
                    placeholder='First name'
                  />
                ) : (
                  <div className='min-h-[2.25rem] flex items-center text-sm'>
                    {contact.firstName ? (
                      <span>{contact.firstName}</span>
                    ) : (
                      <span className='text-tertiary-token italic'>
                        Not provided
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
                <Label className='text-xs text-tertiary-token'>Last name</Label>
                {isEditable ? (
                  <Input
                    value={contact.lastName ?? ''}
                    onChange={event =>
                      handleNameChange('lastName', event.target.value)
                    }
                    placeholder='Last name'
                  />
                ) : (
                  <div className='min-h-[2.25rem] flex items-center text-sm'>
                    {contact.lastName ? (
                      <span>{contact.lastName}</span>
                    ) : (
                      <span className='text-tertiary-token italic'>
                        Not provided
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
                <Label className='text-xs text-tertiary-token'>Username</Label>
                {isEditable ? (
                  <Input
                    value={formatUsername(contact.username)}
                    onChange={event => handleUsernameChange(event.target.value)}
                    placeholder='@username'
                  />
                ) : (
                  <div className='min-h-[2.25rem] flex items-center text-sm'>
                    {contact.username ? (
                      <span>{formatUsername(contact.username)}</span>
                    ) : (
                      <span className='text-tertiary-token italic'>
                        Not provided
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Social links */}
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <Label className='text-xs text-tertiary-token'>
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
                <p className='text-xs text-secondary-token'>
                  No social links yet.{' '}
                  {isEditable ? 'Use the + button to add one.' : ''}
                </p>
              ) : null}

              {contact.socialLinks.length > 0 && (
                <div className='flex flex-wrap gap-2'>
                  {contact.socialLinks.map((link, index) => {
                    const label = link.label || link.url;
                    return (
                      <a
                        key={link.id ?? `${link.url}-${index}`}
                        href={link.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='inline-flex items-center gap-1 rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-xs text-primary-token shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                      >
                        <SocialIcon
                          platform={link.label || 'link'}
                          className='h-3.5 w-3.5'
                          aria-hidden
                        />
                        <span className='max-w-[140px] truncate'>{label}</span>
                        <ExternalLink
                          className='h-3 w-3 text-tertiary-token'
                          aria-hidden
                        />
                        {isEditable && (
                          <button
                            type='button'
                            className='ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-tertiary-token hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent'
                            aria-label={`Remove ${label} link`}
                            onClick={event => {
                              event.preventDefault();
                              handleRemoveLink(index);
                            }}
                          >
                            <X className='h-3 w-3' />
                          </button>
                        )}
                      </a>
                    );
                  })}
                </div>
              )}

              {isEditable && isAddingLink && (
                <div className='mt-2 space-y-2 rounded-lg border border-dashed border-subtle bg-surface-0/60 p-3'>
                  <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
                    <Label className='text-xs text-tertiary-token'>Label</Label>
                    <Input
                      value={newLinkLabel}
                      onChange={event => setNewLinkLabel(event.target.value)}
                      onKeyDown={handleNewLinkKeyDown}
                      placeholder='Instagram'
                      autoFocus
                    />
                  </div>
                  <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
                    <Label className='text-xs text-tertiary-token'>URL</Label>
                    <Input
                      type='url'
                      value={newLinkUrl}
                      onChange={event => setNewLinkUrl(event.target.value)}
                      onKeyDown={handleNewLinkKeyDown}
                      placeholder='https://...'
                      inputMode='url'
                      autoCapitalize='none'
                      autoCorrect='off'
                    />
                  </div>
                  <div className='flex justify-end gap-2 pt-1'>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        setIsAddingLink(false);
                        setNewLinkLabel('');
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
                  {isSaving ? 'Saving hellip;' : 'Save changes'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
