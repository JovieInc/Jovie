'use client';

/**
 * ContactSidebar Component
 *
 * A sidebar component for displaying and editing contact details,
 * including avatar, name, username, and social links.
 */

import type { CommonDropdownItem } from '@jovie/ui';
import { Button } from '@jovie/ui';
import { Copy, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { memo, useMemo } from 'react';
import { toast } from 'sonner';

import { RightDrawer } from '@/components/organisms/RightDrawer';
import {
  type ContextMenuItemType,
  convertToCommonDropdownItems,
} from '@/components/organisms/table';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';

import { ContactAvatar } from './ContactAvatar';
import { ContactFields } from './ContactFields';
import { ContactSidebarHeader } from './ContactSidebarHeader';
import { ContactSocialLinks } from './ContactSocialLinks';
import type { ContactSidebarProps } from './types';
import { useContactSidebar } from './useContactSidebar';

export const ContactSidebar = memo(function ContactSidebar({
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
  const {
    isAddingLink,
    setIsAddingLink,
    newLinkUrl,
    setNewLinkUrl,
    isEditable,
    hasContact,
    fullName,
    canUploadAvatar,
    handleAvatarUpload,
    handleCopyProfileUrl,
    handleNameChange,
    handleUsernameChange,
    handleAddLink,
    handleRemoveLink,
    handleNewLinkKeyDown,
    handleKeyDown,
  } = useContactSidebar({
    contact,
    mode,
    onClose,
    onContactChange,
    onAvatarUpload,
  });

  // Only depend on specific contact fields, not the entire contact object
  const username = contact?.username;
  const contextMenuItems = useMemo<CommonDropdownItem[]>(() => {
    if (!hasContact) return [];

    const items: ContextMenuItemType[] = [];

    if (username) {
      items.push(
        {
          id: 'copy-url',
          label: 'Copy profile URL',
          icon: <Copy className='h-4 w-4' />,
          onClick: () => void handleCopyProfileUrl(),
        },
        {
          id: 'open-profile',
          label: 'Open profile',
          icon: <ExternalLink className='h-4 w-4' />,
          onClick: () => globalThis.open(`/${username}`, '_blank'),
        }
      );
    }

    items.push(
      {
        id: 'refresh',
        label: 'Refresh',
        icon: <RefreshCw className='h-4 w-4' />,
        onClick: () => (onRefresh ?? (() => globalThis.location.reload()))(),
      },
      { type: 'separator' },
      {
        id: 'delete',
        label: 'Delete contact',
        icon: <Trash2 className='h-4 w-4' />,
        onClick: () => toast.info('Delete not implemented'),
      }
    );

    return convertToCommonDropdownItems(items);
  }, [hasContact, username, handleCopyProfileUrl, onRefresh]);

  return (
    <RightDrawer
      isOpen={isOpen}
      width={SIDEBAR_WIDTH}
      ariaLabel='Contact details'
      onKeyDown={handleKeyDown}
      contextMenuItems={contextMenuItems}
      className='bg-surface-1'
      data-testid='contact-sidebar'
    >
      <ContactSidebarHeader
        contact={contact}
        hasContact={hasContact}
        onClose={onClose}
        onRefresh={onRefresh}
        onCopyProfileUrl={handleCopyProfileUrl}
      />

      <div className='flex-1 space-y-6 overflow-auto px-4 py-4'>
        {contact ? (
          <>
            <ContactAvatar
              avatarUrl={contact.avatarUrl ?? null}
              fullName={fullName}
              username={contact.username}
              isVerified={contact.isVerified}
              canUploadAvatar={canUploadAvatar}
              onAvatarUpload={canUploadAvatar ? handleAvatarUpload : undefined}
            />

            <ContactFields
              firstName={contact.firstName}
              lastName={contact.lastName}
              username={contact.username}
              isEditable={isEditable}
              onNameChange={handleNameChange}
              onUsernameChange={handleUsernameChange}
            />

            <ContactSocialLinks
              contact={contact}
              fullName={fullName}
              isEditable={isEditable}
              isAddingLink={isAddingLink}
              newLinkUrl={newLinkUrl}
              onSetIsAddingLink={setIsAddingLink}
              onSetNewLinkUrl={setNewLinkUrl}
              onAddLink={handleAddLink}
              onRemoveLink={handleRemoveLink}
              onNewLinkKeyDown={handleNewLinkKeyDown}
            />

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
        ) : (
          <p className='text-xs text-sidebar-muted'>
            Select a row in the table and press Space to view contact details.
          </p>
        )}
      </div>
    </RightDrawer>
  );
});
