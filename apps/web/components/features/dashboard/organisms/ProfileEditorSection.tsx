/**
 * ProfileEditorSection Component
 *
 * Renders the profile editing UI including avatar, display name, and username.
 * Provides inline editing with debounced saves.
 */

'use client';

import { Input } from '@jovie/ui';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { cn } from '@/lib/utils';
import type { Artist } from '@/types/db';
import type { EditingField } from './links/hooks/useProfileEditor';

interface ProfileIdentityFieldRowProps {
  readonly label: string;
  readonly editing: boolean;
  readonly value: string;
  readonly emptyLabel: string;
  readonly ariaLabel: string;
  readonly onEdit: () => void;
  readonly input: ReactNode;
  readonly tone?: 'primary' | 'secondary';
  readonly controlsId: string;
  readonly className?: string;
}

function ProfileIdentityFieldRow({
  label,
  editing,
  value,
  emptyLabel,
  ariaLabel,
  onEdit,
  input,
  tone = 'secondary',
  controlsId,
  className,
}: Readonly<ProfileIdentityFieldRowProps>) {
  return (
    <div
      className={cn(
        'space-y-2 border-b border-subtle px-4 py-3.5 last:border-b-0 sm:px-5',
        className
      )}
    >
      <p className='text-center text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
        {label}
      </p>
      {editing ? (
        input
      ) : (
        <button
          type='button'
          className={cn(
            'w-full rounded-[10px] border border-transparent px-4 py-3 text-center transition-[background-color,border-color,box-shadow,color] duration-150 hover:border-subtle hover:bg-surface-1 focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20 active:bg-surface-2',
            tone === 'primary'
              ? 'min-h-[52px] text-[17px] font-[560] tracking-[-0.02em] text-primary-token'
              : 'min-h-[44px] text-[13px] font-[510] tracking-[-0.01em] text-secondary-token'
          )}
          onClick={onEdit}
          aria-label={ariaLabel}
          aria-pressed={editing}
          aria-controls={controlsId}
        >
          {value || emptyLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Props for the ProfileEditorSection component
 */
export interface ProfileEditorSectionProps {
  /** Artist data for display */
  readonly artist: Artist;
  /** Avatar URL */
  readonly avatarUrl: string | null;
  /** Username value */
  readonly username: string;
  /** Display name value */
  readonly displayName: string;
  /** Current field being edited */
  readonly editingField: EditingField;
  /** Set editing field */
  readonly setEditingField: (field: EditingField) => void;
  /** Display name input ref */
  readonly displayNameInputRef: React.RefObject<HTMLInputElement | null>;
  /** Username input ref */
  readonly usernameInputRef: React.RefObject<HTMLInputElement | null>;
  /** Profile display name value (for input) */
  readonly profileDisplayName: string;
  /** Profile username value (for input) */
  readonly profileUsername: string;
  /** Handle display name change */
  readonly onDisplayNameChange: (value: string) => void;
  /** Handle username change */
  readonly onUsernameChange: (value: string) => void;
  /** Handle avatar upload */
  readonly onAvatarUpload: (file: File) => Promise<string>;
  /** Handle input key down */
  readonly onInputKeyDown: (
    e: React.KeyboardEvent,
    field: 'displayName' | 'username'
  ) => void;
  /** Handle input blur */
  readonly onInputBlur: () => void;
}

/**
 * ProfileEditorSection renders the profile avatar and editable name/username fields.
 *
 * Features:
 * - Avatar upload with drag-and-drop support
 * - Inline editing for display name and username
 * - Keyboard navigation (Enter to save, Escape to cancel)
 * - Debounced auto-save
 *
 * @example
 * ```tsx
 * <ProfileEditorSection
 *   artist={artist}
 *   avatarUrl={avatarUrl}
 *   username={username}
 *   displayName={displayName}
 *   editingField={editingField}
 *   setEditingField={setEditingField}
 *   displayNameInputRef={displayNameInputRef}
 *   usernameInputRef={usernameInputRef}
 *   profileDisplayName={profileDisplayName}
 *   profileUsername={profileUsername}
 *   onDisplayNameChange={handleDisplayNameChange}
 *   onUsernameChange={handleUsernameChange}
 *   onAvatarUpload={handleAvatarUpload}
 *   onInputKeyDown={handleInputKeyDown}
 *   onInputBlur={handleInputBlur}
 * />
 * ```
 */
export function ProfileEditorSection({
  artist,
  avatarUrl,
  username,
  displayName,
  editingField,
  setEditingField,
  displayNameInputRef,
  usernameInputRef,
  profileDisplayName,
  profileUsername,
  onDisplayNameChange,
  onUsernameChange,
  onAvatarUpload,
  onInputKeyDown,
  onInputBlur,
}: ProfileEditorSectionProps) {
  return (
    <div className='mx-auto w-full max-w-2xl px-4 sm:px-0'>
      <div className='flex flex-col items-center gap-5'>
        <AvatarUploadable
          src={avatarUrl}
          alt={`Avatar for @${username}`}
          name={displayName}
          size='display-lg'
          uploadable
          onUpload={onAvatarUpload}
          onError={message => {
            toast.error(
              message || 'Failed to upload avatar. Please try again.'
            );
          }}
          maxFileSize={AVATAR_MAX_FILE_SIZE_BYTES}
          acceptedTypes={SUPPORTED_IMAGE_MIME_TYPES}
          showHoverOverlay
        />

        <ContentSurfaceCard className='w-full max-w-md overflow-hidden'>
          <ProfileIdentityFieldRow
            label='Display name'
            editing={editingField === 'displayName'}
            value={profileDisplayName}
            emptyLabel='Add display name'
            ariaLabel='Edit display name'
            onEdit={() => setEditingField('displayName')}
            controlsId='profile-display-name'
            tone='primary'
            input={
              <Input
                ref={displayNameInputRef as React.RefObject<HTMLInputElement>}
                id='profile-display-name'
                type='text'
                aria-label='Display name'
                value={profileDisplayName}
                onChange={e => onDisplayNameChange(e.target.value)}
                onKeyDown={e => onInputKeyDown(e, 'displayName')}
                onBlur={onInputBlur}
                className='min-h-[46px] rounded-[10px] border-default bg-surface-0 text-center text-[15px] font-[560] tracking-[-0.02em] text-primary-token'
              />
            }
          />
          <ProfileIdentityFieldRow
            label='Username'
            editing={editingField === 'username'}
            value={profileUsername}
            emptyLabel='Add username'
            ariaLabel='Edit username'
            onEdit={() => setEditingField('username')}
            controlsId='profile-username'
            input={
              <Input
                ref={usernameInputRef as React.RefObject<HTMLInputElement>}
                id='profile-username'
                type='text'
                aria-label='Username'
                data-1p-ignore
                autoComplete='off'
                value={profileUsername}
                onChange={e => onUsernameChange(e.target.value)}
                onKeyDown={e => onInputKeyDown(e, 'username')}
                onBlur={onInputBlur}
                className='min-h-[42px] rounded-[10px] border-default bg-surface-0 text-center text-[13px] font-[510] tracking-[-0.01em] text-primary-token'
              />
            }
          />
        </ContentSurfaceCard>
      </div>
    </div>
  );
}
