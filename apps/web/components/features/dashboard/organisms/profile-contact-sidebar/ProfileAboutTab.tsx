'use client';

import { Badge } from '@jovie/ui';
import { Calendar, Home, type LucideIcon, MapPin, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { updateAllowProfilePhotoDownloads } from '@/app/app/(shell)/dashboard/actions/creator-profile';
import {
  DrawerAsyncToggle,
  DrawerSection,
} from '@/components/molecules/drawer';
import { GenrePicker } from '@/components/molecules/GenrePicker';
import { LocationPicker } from '@/components/molecules/LocationPicker';

interface ProfileAboutTabProps {
  readonly bio: string | null;
  readonly genres: string[] | null;
  readonly location: string | null;
  readonly hometown: string | null;
  readonly activeSinceYear: number | null;
  readonly allowPhotoDownloads: boolean;
  readonly onBioChange?: (bio: string) => void;
  readonly onLocationChange?: (location: string | null) => void;
  readonly onHometownChange?: (hometown: string | null) => void;
  readonly onGenresChange?: (genres: string[]) => void;
}

/** Inline-editable textarea for bio (click-to-edit pattern). */
function EditableBio({
  value,
  onChange,
}: {
  readonly value: string | null;
  readonly onChange: (bio: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const len = textareaRef.current.value.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const handleSave = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (value ?? '').trim()) {
      onChange(trimmed);
    }
  }, [draft, value, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft(value ?? '');
        setEditing(false);
      }
    },
    [value]
  );

  if (!editing) {
    return (
      <button
        type='button'
        onClick={() => {
          setDraft(value ?? '');
          setEditing(true);
        }}
        className='w-full text-left cursor-text'
      >
        {value ? (
          <p className='text-[13px] leading-relaxed text-secondary-token whitespace-pre-wrap'>
            {value}
          </p>
        ) : (
          <p className='text-[13px] text-tertiary-token'>
            Click to add a bio...
          </p>
        )}
      </button>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      maxLength={512}
      rows={4}
      className='w-full rounded-md border border-subtle bg-surface-1 px-2.5 py-2 text-[13px] leading-relaxed text-secondary-token placeholder:text-tertiary-token outline-none focus:border-interactive resize-none'
      placeholder='Write your bio...'
    />
  );
}

/** Renders a location-style field: editable via LocationPicker or static text. */
function LocationField({
  icon: Icon,
  value,
  label,
  addLabel,
  onChange,
}: {
  readonly icon: LucideIcon;
  readonly value: string | null;
  readonly label: (v: string) => string;
  readonly addLabel: string;
  readonly onChange?: (v: string | null) => void;
}) {
  if (value) {
    if (onChange) {
      return (
        <LocationPicker
          value={value}
          onSelect={onChange}
          placeholder={`Change ${addLabel.toLowerCase()}`}
          trigger={
            <button
              type='button'
              className='flex items-center gap-2 text-[13px] text-secondary-token hover:text-primary-token transition-colors'
            >
              <Icon
                className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
                aria-hidden='true'
              />
              <span className='capitalize'>{label(value)}</span>
            </button>
          }
        />
      );
    }
    return (
      <div className='flex items-center gap-2 text-[13px] text-tertiary-token'>
        <Icon className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
        <span className='capitalize'>{label(value)}</span>
      </div>
    );
  }

  if (onChange) {
    return (
      <LocationPicker
        value={null}
        onSelect={onChange}
        placeholder={`Add your ${addLabel.toLowerCase()}`}
        trigger={
          <button
            type='button'
            className='flex items-center gap-2 text-[13px] text-tertiary-token hover:text-secondary-token transition-colors'
          >
            <Icon className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
            <span>Add your {addLabel.toLowerCase()}</span>
          </button>
        }
      />
    );
  }

  return null;
}

export function ProfileAboutTab({
  bio,
  genres,
  location,
  hometown,
  activeSinceYear,
  allowPhotoDownloads,
  onBioChange,
  onLocationChange,
  onHometownChange,
  onGenresChange,
}: ProfileAboutTabProps) {
  const hasGenres = genres && genres.length > 0;
  const hasMetadata =
    Boolean(location) || Boolean(hometown) || Boolean(activeSinceYear);
  const editable = Boolean(onLocationChange);

  return (
    <div className='space-y-5'>
      {/* Bio */}
      <DrawerSection title='Bio' collapsible={false}>
        {onBioChange ? (
          <EditableBio value={bio} onChange={onBioChange} />
        ) : bio ? (
          <p className='text-[13px] leading-relaxed text-secondary-token whitespace-pre-wrap'>
            {bio}
          </p>
        ) : (
          <p className='text-[13px] text-tertiary-token'>
            No bio yet. Use the chat to generate one.
          </p>
        )}
      </DrawerSection>

      {/* Location / Hometown / Active Since */}
      {(hasMetadata || editable) && (
        <DrawerSection title='Location' collapsible={false}>
          <div className='space-y-2'>
            <LocationField
              icon={MapPin}
              value={location}
              label={v => v}
              addLabel='Location'
              onChange={onLocationChange}
            />
            <LocationField
              icon={Home}
              value={hometown}
              label={v => `From ${v}`}
              addLabel='Hometown'
              onChange={onHometownChange}
            />

            {/* Active since */}
            {Boolean(activeSinceYear) && (
              <div className='flex items-center gap-2 text-[13px] text-tertiary-token'>
                <Calendar className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                <span>Active since {activeSinceYear}</span>
              </div>
            )}
          </div>
        </DrawerSection>
      )}

      {/* Genres */}
      <DrawerSection title='Genres' collapsible={false}>
        {hasGenres ? (
          <div className='flex flex-wrap gap-1.5'>
            {genres.map(genre => (
              <Badge
                key={genre}
                variant='secondary'
                className='capitalize gap-1'
              >
                {genre}
                {onGenresChange && (
                  <button
                    type='button'
                    onClick={() =>
                      onGenresChange(genres.filter(g => g !== genre))
                    }
                    className='ml-0.5 hover:text-primary-token transition-colors'
                    aria-label={`Remove ${genre}`}
                  >
                    <X className='h-3 w-3' />
                  </button>
                )}
              </Badge>
            ))}
            {onGenresChange && (
              <GenrePicker
                selected={genres}
                onChange={onGenresChange}
                trigger={
                  <button
                    type='button'
                    className='inline-flex items-center gap-0.5 rounded-full border border-dashed border-subtle px-2.5 py-0.5 text-[11px] font-medium text-tertiary-token hover:text-secondary-token hover:border-secondary-token transition-colors'
                  >
                    <Plus className='h-3 w-3' />
                    Add
                  </button>
                }
              />
            )}
          </div>
        ) : onGenresChange ? (
          <GenrePicker
            selected={[]}
            onChange={onGenresChange}
            trigger={
              <button
                type='button'
                className='flex items-center gap-1.5 text-[13px] text-tertiary-token hover:text-secondary-token transition-colors'
              >
                <Plus className='h-3.5 w-3.5' />
                <span>Add genres</span>
              </button>
            }
          />
        ) : (
          <p className='text-[13px] text-tertiary-token'>
            Auto-detected from your music connections.
          </p>
        )}
      </DrawerSection>

      {/* Settings */}
      <DrawerSection title='Settings' collapsible={false}>
        <DrawerAsyncToggle
          label='Photo downloads'
          ariaLabel='Allow profile photo downloads on public pages'
          checked={allowPhotoDownloads}
          onToggle={updateAllowProfilePhotoDownloads}
          successMessage={on =>
            on
              ? 'Photo downloads enabled for visitors'
              : 'Photo downloads disabled'
          }
        />
      </DrawerSection>
    </div>
  );
}
