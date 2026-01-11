'use client';

/**
 * ContactSidebar Component
 *
 * A sidebar component for displaying and editing contact details,
 * including avatar, name, username, and social links.
 */

import { Button } from '@jovie/ui';

import { cn } from '@/lib/utils';

import { ContactAvatar } from './ContactAvatar';
import { ContactFields } from './ContactFields';
import { ContactSidebarHeader } from './ContactSidebarHeader';
import { ContactSocialLinks } from './ContactSocialLinks';
import type { ContactSidebarProps } from './types';
import { useContactSidebar } from './useContactSidebar';

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

  return (
    <aside
      aria-label='Contact details'
      aria-hidden={!isOpen}
      data-testid='contact-sidebar'
      className={cn(
        'relative flex h-full min-h-screen flex-col bg-surface-2 text-sidebar-foreground border-l border-subtle transition-[width,opacity,transform] duration-200 ease-out overflow-hidden',
        'w-0 opacity-0 translate-x-4 pointer-events-none',
        isOpen &&
          'pointer-events-auto w-full opacity-100 translate-x-0 md:w-[300px] lg:w-[320px]'
      )}
      onKeyDown={handleKeyDown}
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
    </aside>
  );
}
