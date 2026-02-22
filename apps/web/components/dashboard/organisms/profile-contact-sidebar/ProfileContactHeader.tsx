'use client';

import { Input } from '@jovie/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { cn } from '@/lib/utils';

type EditingField = 'displayName' | 'username' | null;

export interface ProfileContactHeaderProps {
  readonly displayName: string;
  readonly username: string;
  readonly avatarUrl: string | null;
  /** When true, fields become click-to-edit and avatar is uploadable */
  readonly editable?: boolean;
  /** Called when display name is changed (debounced save handled by parent) */
  readonly onDisplayNameChange?: (value: string) => void;
  /** Called when username is changed */
  readonly onUsernameChange?: (value: string) => void;
  /** Called when avatar file is selected */
  readonly onAvatarUpload?: (file: File) => Promise<string>;
}

export function ProfileContactHeader({
  displayName,
  username,
  avatarUrl,
  editable = false,
  onDisplayNameChange,
  onUsernameChange,
  onAvatarUpload,
}: ProfileContactHeaderProps) {
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [localDisplayName, setLocalDisplayName] = useState(displayName);
  const [localUsername, setLocalUsername] = useState(username);
  const displayNameRef = useRef<HTMLInputElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);

  // Sync local state when props change (e.g. from chat edit)
  useEffect(() => {
    if (editingField !== 'displayName') {
      setLocalDisplayName(displayName);
    }
  }, [displayName, editingField]);

  useEffect(() => {
    if (editingField !== 'username') {
      setLocalUsername(username);
    }
  }, [username, editingField]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingField === 'displayName') {
      displayNameRef.current?.focus();
      displayNameRef.current?.select();
    }
    if (editingField === 'username') {
      usernameRef.current?.focus();
      usernameRef.current?.select();
    }
  }, [editingField]);

  const handleDisplayNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        const trimmed = localDisplayName.trim();
        if (trimmed) {
          onDisplayNameChange?.(trimmed);
        }
        setEditingField(null);
      }
      if (e.key === 'Escape') {
        setLocalDisplayName(displayName);
        setEditingField(null);
      }
    },
    [localDisplayName, displayName, onDisplayNameChange]
  );

  const handleDisplayNameBlur = useCallback(() => {
    const trimmed = localDisplayName.trim();
    if (trimmed && trimmed !== displayName) {
      onDisplayNameChange?.(trimmed);
    }
    setEditingField(null);
  }, [localDisplayName, displayName, onDisplayNameChange]);

  const handleUsernameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        const trimmed = localUsername.trim();
        if (trimmed) {
          onUsernameChange?.(trimmed);
        }
        setEditingField(null);
      }
      if (e.key === 'Escape') {
        setLocalUsername(username);
        setEditingField(null);
      }
    },
    [localUsername, username, onUsernameChange]
  );

  const handleUsernameBlur = useCallback(() => {
    const trimmed = localUsername.trim();
    if (trimmed && trimmed !== username) {
      onUsernameChange?.(trimmed);
    }
    setEditingField(null);
  }, [localUsername, username, onUsernameChange]);

  return (
    <div className='flex items-center gap-3'>
      {/* Avatar */}
      {editable && onAvatarUpload ? (
        <AvatarUploadable
          src={avatarUrl}
          alt={displayName ? `${displayName} avatar` : 'Profile avatar'}
          name={displayName}
          size='lg'
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
      ) : (
        <AvatarUploadable
          src={avatarUrl}
          alt={displayName ? `${displayName} avatar` : 'Profile avatar'}
          name={displayName}
          size='lg'
        />
      )}

      {/* Name and username */}
      <div className='min-w-0 flex-1'>
        {/* Display Name */}
        {editable && editingField === 'displayName' ? (
          <Input
            ref={displayNameRef}
            type='text'
            aria-label='Display name'
            value={localDisplayName}
            onChange={e => setLocalDisplayName(e.target.value)}
            onKeyDown={handleDisplayNameKeyDown}
            onBlur={handleDisplayNameBlur}
            className='h-7 text-sm font-medium px-1'
          />
        ) : (
          <button
            type='button'
            className={cn(
              'block w-full truncate text-left text-sm font-medium text-primary-token',
              editable &&
                'rounded px-1 -mx-1 transition-colors hover:bg-surface-2 cursor-text'
            )}
            onClick={
              editable ? () => setEditingField('displayName') : undefined
            }
            disabled={!editable}
            aria-label={editable ? 'Click to edit display name' : undefined}
          >
            {localDisplayName || 'Add display name'}
          </button>
        )}

        {/* Username */}
        {editable && editingField === 'username' ? (
          <Input
            ref={usernameRef}
            type='text'
            aria-label='Username'
            data-1p-ignore
            autoComplete='off'
            value={localUsername}
            onChange={e => {
              const raw = e.target.value;
              setLocalUsername(raw.startsWith('@') ? raw.slice(1) : raw);
            }}
            onKeyDown={handleUsernameKeyDown}
            onBlur={handleUsernameBlur}
            className='h-6 text-xs px-1 mt-0.5'
          />
        ) : (
          <button
            type='button'
            className={cn(
              'block w-full truncate text-left text-xs text-sidebar-muted',
              editable &&
                'rounded px-1 -mx-1 transition-colors hover:bg-surface-2 cursor-text'
            )}
            onClick={editable ? () => setEditingField('username') : undefined}
            disabled={!editable}
            aria-label={editable ? 'Click to edit username' : undefined}
          >
            @{localUsername || 'username'}
          </button>
        )}
      </div>
    </div>
  );
}
