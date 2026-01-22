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
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';

import { ContactAvatar } from './ContactAvatar';
import { ContactFields } from './ContactFields';
import { ContactSidebarHeader } from './ContactSidebarHeader';
import { ContactSocialLinks } from './ContactSocialLinks';
import type { ContactSidebarProps } from './types';
import { useContactSidebar } from './useContactSidebar';

const CONTEXT_MENU_ITEM_CLASS =
  'rounded-md px-2 py-1 text-[12.5px] font-medium leading-[16px] [&_svg]:text-tertiary-token hover:[&_svg]:text-secondary-token data-[highlighted]:[&_svg]:text-secondary-token focus-visible:[&_svg]:text-secondary-token';

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

    const items: CommonDropdownItem[] = [];

    if (username) {
      items.push({
        type: 'action',
        id: 'copy-url',
        label: 'Copy profile URL',
        icon: <Copy className='h-4 w-4' />,
        onClick: () => void handleCopyProfileUrl(),
        className: CONTEXT_MENU_ITEM_CLASS,
      });

      items.push({
        type: 'action',
        id: 'open-profile',
        label: 'Open profile',
        icon: <ExternalLink className='h-4 w-4' />,
        onClick: () => window.open(`/${username}`, '_blank'),
        className: CONTEXT_MENU_ITEM_CLASS,
      });
    }

    items.push({
      type: 'action',
      id: 'refresh',
      label: 'Refresh',
      icon: <RefreshCw className='h-4 w-4' />,
      onClick: () => {
        if (onRefresh) {
          onRefresh();
        } else {
          window.location.reload();
        }
      },
      className: CONTEXT_MENU_ITEM_CLASS,
    });

    items.push({ type: 'separator', id: 'sep-1', className: '-mx-0.5 my-1' });

    items.push({
      type: 'action',
      id: 'delete',
      label: 'Delete contact',
      icon: <Trash2 className='h-4 w-4' />,
      onClick: () => toast.info('Delete not implemented'),
      variant: 'destructive',
      className: CONTEXT_MENU_ITEM_CLASS,
    });

    return items;
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
        {!contact ? (
          <p className='text-xs text-sidebar-muted'>
            Select a row in the table and press Space to view contact details.
          </p>
        ) : (
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
        )}
      </div>
    </RightDrawer>
  );
});
