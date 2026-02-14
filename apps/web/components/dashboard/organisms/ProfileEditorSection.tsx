/**
 * ProfileEditorSection Component
 *
 * Renders the profile editing UI including avatar, display name, and username.
 * Provides inline editing with debounced saves.
 */

'use client';

import { Input } from '@jovie/ui';
import { toast } from 'sonner';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import type { Artist } from '@/types/db';
import type { EditingField } from './links/hooks/useProfileEditor';

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
      <div className='flex flex-col items-center gap-4'>
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

        <div className='w-full max-w-md space-y-2'>
          {/* Display Name Field - Primary hierarchy */}
          <div className='grid gap-1'>
            {editingField === 'displayName' ? (
              <Input
                ref={displayNameInputRef as React.RefObject<HTMLInputElement>}
                id='profile-display-name'
                type='text'
                aria-label='Display name'
                value={profileDisplayName}
                onChange={e => onDisplayNameChange(e.target.value)}
                onKeyDown={e => onInputKeyDown(e, 'displayName')}
                onBlur={onInputBlur}
                className='min-h-[48px] text-center text-base sm:min-h-[44px]'
              />
            ) : (
              <button
                type='button'
                className='min-h-[48px] w-full rounded-xl py-3 text-center text-lg font-semibold text-primary-token transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent active:opacity-90 sm:min-h-[44px] sm:rounded-lg sm:py-2 sm:text-base sm:font-medium'
                onClick={() => setEditingField('displayName')}
                aria-label='Edit display name'
              >
                {profileDisplayName || 'Add display name'}
              </button>
            )}
          </div>

          {/* Username Field - Secondary hierarchy */}
          <div className='grid gap-1'>
            {editingField === 'username' ? (
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
                className='min-h-[44px] text-center text-sm'
              />
            ) : (
              <button
                type='button'
                className='min-h-[44px] w-full rounded-xl py-2.5 text-center text-sm font-medium text-secondary-token transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent active:opacity-90 sm:rounded-lg sm:py-2'
                onClick={() => setEditingField('username')}
                aria-label='Edit username'
              >
                {profileUsername || 'Add username'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
