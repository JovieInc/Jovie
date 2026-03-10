'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { SegmentControl } from '@jovie/ui';
import { Copy, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { EntitySidebarShell } from '@/components/molecules/drawer';
import {
  type ContextMenuItemType,
  convertToCommonDropdownItems,
} from '@/components/organisms/table';

import { ContactAvatar } from './ContactAvatar';
import { ContactFields } from './ContactFields';
import { useContactHeaderParts } from './ContactSidebarHeader';
import { ContactSocialLinks } from './ContactSocialLinks';
import type { ContactSidebarProps } from './types';
import { useContactSidebar } from './useContactSidebar';

type SidebarTab = 'details' | 'social';

const SIDEBAR_TAB_OPTIONS = [
  { value: 'details' as const, label: 'Details' },
  { value: 'social' as const, label: 'Social' },
];

export const ContactSidebar = memo(function ContactSidebar({
  contact,
  mode,
  isOpen,
  onClose,
  onRefresh,
  onContactChange,
  contextMenuItems: providedContextMenuItems,
  onAvatarUpload,
}: ContactSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('details');

  const {
    isAddingLink,
    setIsAddingLink,
    newLinkUrl,
    setNewLinkUrl,
    hasContact,
    fullName,
    displayName,
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

  const { title: headerTitle, actions: headerActions } = useContactHeaderParts({
    contact,
    hasContact,
    onRefresh,
    onCopyProfileUrl: () => {
      handleCopyProfileUrl();
    },
    onClose,
  });

  // Only depend on specific contact fields, not the entire contact object
  const username = contact?.username;
  const fallbackContextMenuItems = useMemo<CommonDropdownItem[]>(() => {
    if (!hasContact) return [];

    const items: ContextMenuItemType[] = [
      ...(username
        ? [
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
            },
          ]
        : []),
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
      },
    ];

    return convertToCommonDropdownItems(items);
  }, [hasContact, username, handleCopyProfileUrl, onRefresh]);

  const contextMenuItems = providedContextMenuItems ?? fallbackContextMenuItems;

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Contact details'
      onKeyDown={handleKeyDown}
      contextMenuItems={contextMenuItems}
      data-testid='contact-sidebar'
      title={headerTitle}
      onClose={onClose}
      headerActions={headerActions}
      isEmpty={!contact}
      emptyMessage='Select a row in the table to view contact details.'
      entityHeader={
        contact ? (
          <ContactAvatar
            avatarUrl={contact.avatarUrl ?? null}
            fullName={fullName}
            username={contact.username}
            isVerified={contact.isVerified}
            canUploadAvatar={canUploadAvatar}
            onAvatarUpload={canUploadAvatar ? handleAvatarUpload : undefined}
          />
        ) : undefined
      }
      tabs={
        contact ? (
          <SegmentControl
            value={activeTab}
            onValueChange={setActiveTab}
            options={SIDEBAR_TAB_OPTIONS}
            size='sm'
            aria-label='Contact sidebar view'
          />
        ) : undefined
      }
    >
      {contact && (
        <>
          {activeTab === 'details' && (
            <ContactFields
              name={displayName ?? ''}
              username={contact.username}
              onNameChange={handleNameChange}
              onUsernameChange={handleUsernameChange}
            />
          )}

          {activeTab === 'social' && (
            <ContactSocialLinks
              contact={contact}
              fullName={fullName}
              isAddingLink={isAddingLink}
              newLinkUrl={newLinkUrl}
              onSetIsAddingLink={setIsAddingLink}
              onSetNewLinkUrl={setNewLinkUrl}
              onAddLink={handleAddLink}
              onRemoveLink={handleRemoveLink}
              onNewLinkKeyDown={handleNewLinkKeyDown}
            />
          )}
        </>
      )}
    </EntitySidebarShell>
  );
});
