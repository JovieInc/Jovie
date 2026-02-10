'use client';

import { useCallback, useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { detectPlatform } from '@/lib/utils/platform-detection';
import type { Contact, ContactSocialLink } from '@/types';
import type { ContactSidebarProps } from './types';
import { isFormElement, isValidUrl, sanitizeUsernameInput } from './utils';

export interface UseContactSidebarReturn {
  isAddingLink: boolean;
  setIsAddingLink: (value: boolean) => void;
  newLinkUrl: string;
  setNewLinkUrl: (value: string) => void;
  isEditable: boolean;
  hasContact: boolean;
  fullName: string;
  canUploadAvatar: boolean;
  handleFieldChange: (updater: (current: Contact) => Contact) => void;
  handleAvatarUpload: (file: File) => Promise<string>;
  handleCopyProfileUrl: () => Promise<void>;
  handleNameChange: (field: 'firstName' | 'lastName', value: string) => void;
  handleUsernameChange: (raw: string) => void;
  handleWebsiteChange: (value: string) => void;
  handleAddLink: () => void;
  handleRemoveLink: (index: number) => void;
  handleNewLinkKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
}

export function useContactSidebar({
  contact,
  mode,
  onClose,
  onContactChange,
  onAvatarUpload,
}: Pick<
  ContactSidebarProps,
  'contact' | 'mode' | 'onClose' | 'onContactChange' | 'onAvatarUpload'
>): UseContactSidebarReturn {
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
        globalThis.location.origin
      ).toString();
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error('Failed to copy profile URL', error);
    }
  }, [contact]);

  const handleNameChange = useCallback(
    (field: 'firstName' | 'lastName', value: string) => {
      handleFieldChange(current => ({ ...current, [field]: value }));
    },
    [handleFieldChange]
  );

  const handleUsernameChange = useCallback(
    (raw: string) => {
      const username = sanitizeUsernameInput(raw);
      handleFieldChange(current => ({ ...current, username }));
    },
    [handleFieldChange]
  );

  const handleWebsiteChange = useCallback(
    (value: string) => {
      handleFieldChange(current => ({ ...current, website: value || null }));
    },
    [handleFieldChange]
  );

  const handleAddLink = useCallback(() => {
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
  }, [contact, onContactChange, newLinkUrl, fullName]);

  const handleRemoveLink = useCallback(
    (index: number) => {
      handleFieldChange(current => ({
        ...current,
        socialLinks: current.socialLinks.filter((_link, i) => i !== index),
      }));
    },
    [handleFieldChange]
  );

  const handleNewLinkKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
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
    },
    [newLinkUrl, handleAddLink]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isFormElement(event.target)) {
        onClose?.();
      }
    },
    [onClose]
  );

  const canUploadAvatar =
    isEditable && Boolean(onAvatarUpload && contact && onContactChange);

  return {
    isAddingLink,
    setIsAddingLink,
    newLinkUrl,
    setNewLinkUrl,
    isEditable,
    hasContact,
    fullName,
    canUploadAvatar,
    handleFieldChange,
    handleAvatarUpload,
    handleCopyProfileUrl,
    handleNameChange,
    handleUsernameChange,
    handleWebsiteChange,
    handleAddLink,
    handleRemoveLink,
    handleNewLinkKeyDown,
    handleKeyDown,
  };
}
