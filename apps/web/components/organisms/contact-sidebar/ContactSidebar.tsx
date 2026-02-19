'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Button, SegmentControl } from '@jovie/ui';
import { Copy, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DrawerEmptyState } from '@/components/molecules/drawer';
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
import { ContactWebsite } from './ContactWebsite';
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
  onSave,
  isSaving,
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
    canUploadAvatar,
    handleAvatarUpload,
    handleCopyProfileUrl,
    handleNameChange,
    handleUsernameChange,
    handleWebsiteChange,
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

  return (
    <RightDrawer
      isOpen={isOpen}
      width={SIDEBAR_WIDTH}
      ariaLabel='Contact details'
      onKeyDown={handleKeyDown}
      contextMenuItems={contextMenuItems}
      data-testid='contact-sidebar'
    >
      <ContactSidebarHeader
        contact={contact}
        hasContact={hasContact}
        onClose={onClose}
        onRefresh={onRefresh}
        onCopyProfileUrl={handleCopyProfileUrl}
      />

      {contact ? (
        <>
          {/* Always-visible avatar + name */}
          <div className='shrink-0 border-b border-subtle px-4 py-3'>
            <ContactAvatar
              avatarUrl={contact.avatarUrl ?? null}
              fullName={fullName}
              username={contact.username}
              isVerified={contact.isVerified}
              canUploadAvatar={canUploadAvatar}
              onAvatarUpload={canUploadAvatar ? handleAvatarUpload : undefined}
            />
          </div>

          {/* Tab navigation */}
          <div className='border-b border-subtle px-3 py-1.5 shrink-0'>
            <SegmentControl
              value={activeTab}
              onValueChange={setActiveTab}
              options={SIDEBAR_TAB_OPTIONS}
              size='sm'
              aria-label='Contact sidebar view'
            />
          </div>

          <div className='flex-1 space-y-4 overflow-auto px-4 py-4'>
            {activeTab === 'details' && (
              <ContactFields
                firstName={contact.firstName}
                lastName={contact.lastName}
                username={contact.username}
                onNameChange={handleNameChange}
                onUsernameChange={handleUsernameChange}
              />
            )}

            {activeTab === 'social' && (
              <>
                <ContactWebsite
                  website={contact.website}
                  onWebsiteChange={handleWebsiteChange}
                />

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
              </>
            )}

            {onSave && contact && (
              <div className='pt-2 flex justify-end'>
                <Button
                  type='button'
                  size='sm'
                  variant='primary'
                  onClick={() => onSave(contact)}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving\u2026' : 'Save changes'}
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className='flex-1 overflow-auto px-4 py-4'>
          <DrawerEmptyState message='Select a row in the table to view contact details.' />
        </div>
      )}
    </RightDrawer>
  );
});
