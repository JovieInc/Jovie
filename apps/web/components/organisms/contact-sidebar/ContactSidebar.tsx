'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Copy, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import {
  DrawerTabbedCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import {
  type ContextMenuItemType,
  convertToCommonDropdownItems,
} from '@/components/organisms/table';

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
  onDelete,
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
      ...(onDelete
        ? [
            { type: 'separator' } as const,
            {
              id: 'delete',
              label: 'Delete contact',
              icon: <Trash2 className='h-4 w-4' />,
              onClick: () => {
                if (contact) {
                  onDelete(contact);
                }
              },
            },
          ]
        : []),
    ];

    return convertToCommonDropdownItems(items);
  }, [
    hasContact,
    username,
    handleCopyProfileUrl,
    onRefresh,
    onDelete,
    contact,
  ]);

  const contextMenuItems = providedContextMenuItems ?? fallbackContextMenuItems;
  const {
    title: headerTitle,
    primaryActions,
    overflowActions,
  } = useContactHeaderParts({
    contact,
    hasContact,
    onRefresh,
    onClose,
  });

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Contact details'
      onKeyDown={handleKeyDown}
      contextMenuItems={contextMenuItems}
      data-testid='contact-sidebar'
      title={headerTitle}
      onClose={contact ? undefined : onClose}
      headerMode='minimal'
      headerActions={
        <DrawerHeaderActions
          primaryActions={primaryActions}
          overflowActions={overflowActions}
          menuItems={contextMenuItems}
          onClose={onClose}
        />
      }
      isEmpty={!contact}
      emptyMessage='Select a row in the table to view contact details.'
    >
      {contact && (
        <DrawerTabbedCard
          testId='contact-tabbed-card'
          tabs={
            <DrawerTabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as SidebarTab)}
              options={SIDEBAR_TAB_OPTIONS}
              ariaLabel='Contact sidebar view'
            />
          }
          contentClassName='pt-2'
        >
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
        </DrawerTabbedCard>
      )}
    </EntitySidebarShell>
  );
});
