'use client';

import { Badge } from '@jovie/ui';
import {
  Calendar,
  Check,
  Home,
  ImagePlus,
  LoaderCircle,
  type LucideIcon,
  MapPin,
  Plus,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  updateAllowProfilePhotoDownloads,
  updateShowOldReleases,
} from '@/app/app/(shell)/dashboard/actions/creator-profile';
import { LINEAR_SURFACE } from '@/components/features/dashboard/tokens';
import { useAvatarUpload } from '@/components/hooks/useAvatarUpload';
import {
  DrawerAsyncToggle,
  DrawerSection,
  DrawerSectionHeading,
} from '@/components/molecules/drawer';
import { GenrePicker } from '@/components/molecules/GenrePicker';
import { LocationPicker } from '@/components/molecules/LocationPicker';
import { cn } from '@/lib/utils';
import type { PressPhoto } from '@/types/press-photos';

const MAX_PRESS_PHOTOS = 6;

function DetailLabel({ children }: { readonly children: string }) {
  return (
    <span className='text-[11px] font-medium text-tertiary-token'>
      {children}
    </span>
  );
}

interface ProfileAboutTabProps {
  readonly bio: string | null;
  readonly genres: string[] | null;
  readonly location: string | null;
  readonly hometown: string | null;
  readonly activeSinceYear: number | null;
  readonly allowPhotoDownloads: boolean;
  readonly showOldReleases: boolean;
  readonly pressPhotos?: readonly PressPhoto[];
  readonly onBioChange?: (bio: string) => void;
  readonly onLocationChange?: (location: string | null) => void;
  readonly onHometownChange?: (hometown: string | null) => void;
  readonly onGenresChange?: (genres: string[]) => void;
  readonly onPressPhotoUpload?: (file: File) => Promise<PressPhoto>;
  readonly onPressPhotoDelete?: (photoId: string) => Promise<void>;
  readonly onPressPhotoApprove?: (photoId: string) => Promise<void>;
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
        className='w-full cursor-text rounded-[10px] px-1 py-0.5 text-left transition-colors hover:bg-surface-0'
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
      className='w-full resize-none rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 px-3 py-2.5 text-[12.5px] leading-relaxed text-secondary-token placeholder:text-tertiary-token outline-none focus:border-interactive'
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
              className='flex items-center gap-2 rounded-[10px] px-1.5 py-1 text-xs text-secondary-token transition-colors hover:bg-surface-0 hover:text-primary-token'
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
      <div className='flex items-center gap-2 text-xs text-tertiary-token'>
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
            className='flex items-center gap-2 rounded-[10px] px-1.5 py-1 text-xs text-tertiary-token transition-colors hover:bg-surface-0 hover:text-secondary-token'
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

function PressPhotosSection({
  pressPhotos,
  onUpload,
  onDelete,
  onApprove,
}: {
  readonly pressPhotos: readonly PressPhoto[];
  readonly onUpload?: (file: File) => Promise<PressPhoto>;
  readonly onDelete?: (photoId: string) => Promise<void>;
  readonly onApprove?: (photoId: string) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [approvingPhotoId, setApprovingPhotoId] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { handleFileUpload, isUploading, previewUrl, uploadProgress } =
    useAvatarUpload({
      onUpload: async file => {
        if (!onUpload) {
          return '';
        }

        const uploaded = await onUpload(file);
        return uploaded.smallUrl ?? uploaded.blobUrl ?? '';
      },
      onError: message => setUploadError(message),
      onSuccess: () => setUploadError(null),
      analyticsPrefix: 'press_photo',
    });

  const canUpload = Boolean(onUpload) && pressPhotos.length < MAX_PRESS_PHOTOS;

  // Split photos into drafts and published
  const draftPhotos = pressPhotos.filter(p => p.status === 'draft');
  const publishedPhotos = pressPhotos.filter(p => p.status === 'ready');
  const otherStatusPhotos = pressPhotos.filter(
    p => p.status !== 'draft' && p.status !== 'ready'
  );

  const handleSelectFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      setUploadError(null);
      await handleFileUpload(file);
      event.target.value = '';
    },
    [handleFileUpload]
  );

  const handleDelete = useCallback(
    async (photoId: string) => {
      if (!onDelete) {
        return;
      }

      setDeletingPhotoId(photoId);
      try {
        await onDelete(photoId);
      } finally {
        setDeletingPhotoId(current => (current === photoId ? null : current));
      }
    },
    [onDelete]
  );

  const handleApprove = useCallback(
    async (photoId: string) => {
      if (!onApprove) {
        return;
      }

      setApprovingPhotoId(photoId);
      try {
        await onApprove(photoId);
      } finally {
        setApprovingPhotoId(current => (current === photoId ? null : current));
      }
    },
    [onApprove]
  );

  const handleApproveAll = useCallback(async () => {
    if (!onApprove) return;
    setUploadError(null);
    let failedCount = 0;

    for (const photo of draftPhotos) {
      try {
        await handleApprove(photo.id);
      } catch {
        failedCount += 1;
      }
    }

    if (failedCount > 0) {
      setUploadError(
        `Failed to approve ${failedCount} photo${failedCount > 1 ? 's' : ''}. Please try again.`
      );
    }
  }, [onApprove, draftPhotos, handleApprove]);

  const remainingSlots = MAX_PRESS_PHOTOS - pressPhotos.length;

  return (
    <DrawerSection className={cn(LINEAR_SURFACE.drawerCard, 'space-y-3 p-3')}>
      <div className='flex items-center justify-between gap-3'>
        <DrawerSectionHeading>Press Photos</DrawerSectionHeading>
        <div className='flex items-center gap-1.5'>
          {draftPhotos.length > 0 && (
            <Badge variant='outline' className='text-3xs tabular-nums'>
              {draftPhotos.length} awaiting approval
            </Badge>
          )}
          <Badge variant='secondary' className='text-3xs tabular-nums'>
            {pressPhotos.length}/{MAX_PRESS_PHOTOS}
          </Badge>
        </div>
      </div>

      {/* First-import banner */}
      {draftPhotos.length > 0 && !bannerDismissed && (
        <div className='relative rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 px-3 py-2'>
          <button
            type='button'
            onClick={() => setBannerDismissed(true)}
            className='absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-tertiary-token hover:text-default'
            aria-label='Dismiss'
          >
            <X className='h-3 w-3' />
          </button>
          <p className='pr-5 text-[11px] text-secondary-token'>
            We found {draftPhotos.length} photo
            {draftPhotos.length > 1 ? 's' : ''} from your streaming profiles.
            Approve the ones you want on your public profile.
          </p>
          {draftPhotos.length >= 2 && onApprove && (
            <button
              type='button'
              onClick={handleApproveAll}
              className='mt-1.5 text-[11px] font-medium text-accent hover:underline'
            >
              Approve all
            </button>
          )}
        </div>
      )}

      {/* Drafts section (awaiting approval) */}
      {draftPhotos.length > 0 && (
        <div className='space-y-1.5'>
          <p className='text-3xs font-medium uppercase tracking-wider text-tertiary-token'>
            Awaiting approval
          </p>
          <div className='grid grid-cols-2 gap-2'>
            {draftPhotos.map(photo => (
              <div
                key={photo.id}
                className='group relative aspect-[4/5] overflow-hidden rounded-[14px] border border-dashed border-(--linear-app-frame-seam) bg-surface-0'
              >
                <Image
                  src={photo.smallUrl ?? photo.mediumUrl ?? photo.blobUrl ?? ''}
                  alt={photo.originalFilename ?? 'Imported press photo'}
                  fill
                  sizes='(max-width: 768px) 45vw, 160px'
                  className='object-cover opacity-60 saturate-50'
                />
                {/* DSP source badge */}
                {photo.sourcePlatform && (
                  <span className='absolute top-2 left-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-medium capitalize text-white'>
                    {photo.sourcePlatform.replace('_', ' ')}
                  </span>
                )}
                {/* Hidden label */}
                <span className='absolute bottom-8 left-0 right-0 text-center text-[9px] font-medium text-white drop-shadow-sm'>
                  Hidden until approved
                </span>
                {/* Delete button */}
                {onDelete && (
                  <button
                    type='button'
                    onClick={() => handleDelete(photo.id)}
                    disabled={deletingPhotoId === photo.id}
                    className='absolute top-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white transition hover:bg-black/70 disabled:cursor-wait disabled:opacity-70'
                    aria-label='Delete imported photo'
                  >
                    {deletingPhotoId === photo.id ? (
                      <LoaderCircle className='h-3 w-3 animate-spin' />
                    ) : (
                      <X className='h-3 w-3' />
                    )}
                  </button>
                )}
                {/* Approve button */}
                {onApprove && (
                  <button
                    type='button'
                    onClick={() => handleApprove(photo.id)}
                    disabled={approvingPhotoId === photo.id}
                    className='absolute right-2 bottom-2 left-2 flex items-center justify-center gap-1 rounded-lg bg-white/90 py-1 text-[11px] font-medium text-black transition hover:bg-white disabled:cursor-wait disabled:opacity-70'
                    aria-label='Approve press photo for public profile'
                  >
                    {approvingPhotoId === photo.id ? (
                      <LoaderCircle className='h-3 w-3 animate-spin' />
                    ) : (
                      <>
                        <Check className='h-3 w-3' />
                        Approve
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other status section */}
      {otherStatusPhotos.length > 0 && (
        <div className='space-y-1.5'>
          <p className='text-3xs font-medium uppercase tracking-wider text-tertiary-token'>
            Other status
          </p>
          <div className='grid grid-cols-2 gap-2'>
            {otherStatusPhotos.map(photo => (
              <div
                key={photo.id}
                className='group relative aspect-[4/5] overflow-hidden rounded-[14px] border border-(--linear-app-frame-seam) bg-surface-0'
              >
                <Image
                  src={photo.smallUrl ?? photo.mediumUrl ?? photo.blobUrl ?? ''}
                  alt={photo.originalFilename ?? 'Press photo'}
                  fill
                  sizes='(max-width: 768px) 45vw, 160px'
                  className='object-cover'
                />
                <span className='absolute top-2 left-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-medium capitalize text-white'>
                  {photo.status}
                </span>
                {onDelete && (
                  <button
                    type='button'
                    onClick={() => handleDelete(photo.id)}
                    disabled={deletingPhotoId === photo.id}
                    className='absolute top-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white transition hover:bg-black/70 disabled:cursor-wait disabled:opacity-70'
                    aria-label='Delete imported photo'
                  >
                    {deletingPhotoId === photo.id ? (
                      <LoaderCircle className='h-3 w-3 animate-spin' />
                    ) : (
                      <X className='h-3 w-3' />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(publishedPhotos.length > 0 || canUpload) && (
        <div className='space-y-1.5'>
          {draftPhotos.length > 0 && publishedPhotos.length > 0 && (
            <p className='text-3xs font-medium uppercase tracking-wider text-tertiary-token'>
              Published
            </p>
          )}
          <div className='grid grid-cols-2 gap-2'>
            {publishedPhotos.map(photo => (
              <div
                key={photo.id}
                className='group relative aspect-[4/5] overflow-hidden rounded-[14px] border border-(--linear-app-frame-seam) bg-surface-0'
              >
                <Image
                  src={photo.smallUrl ?? photo.mediumUrl ?? photo.blobUrl ?? ''}
                  alt={photo.originalFilename ?? 'Press photo'}
                  fill
                  sizes='(max-width: 768px) 45vw, 160px'
                  className='object-cover'
                />
                {onDelete && (
                  <button
                    type='button'
                    onClick={() => handleDelete(photo.id)}
                    disabled={deletingPhotoId === photo.id}
                    className='absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white transition hover:bg-black/70 disabled:cursor-wait disabled:opacity-70'
                    aria-label='Delete press photo'
                  >
                    {deletingPhotoId === photo.id ? (
                      <LoaderCircle className='h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <X className='h-3.5 w-3.5' />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type='button'
            onClick={() => fileInputRef.current?.click()}
            disabled={!canUpload || isUploading}
            className={cn(
              'relative flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-(--linear-app-frame-seam) bg-surface-0 px-3 text-center transition-colors',
              canUpload
                ? 'hover:border-default hover:bg-surface-1'
                : 'cursor-not-allowed opacity-60'
            )}
          >
            {isUploading && previewUrl ? (
              <>
                <div
                  className='absolute inset-0 bg-cover bg-center opacity-70'
                  style={{ backgroundImage: `url(${previewUrl})` }}
                />
                <div className='absolute inset-0 bg-black/35' />
                <div className='relative z-10 flex flex-col items-center gap-1 text-white'>
                  <LoaderCircle className='h-4 w-4 animate-spin' />
                  <span className='text-[11px] font-medium'>
                    Uploading {uploadProgress}%
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-1 text-secondary-token'>
                  <ImagePlus className='h-4 w-4' />
                </div>
                <div className='space-y-0.5'>
                  <p className='text-xs font-medium text-secondary-token'>
                    Add photo
                  </p>
                  <p className='text-[11px] text-tertiary-token'>
                    AVIF, JPG, PNG, HEIC
                  </p>
                </div>
              </>
            )}
          </button>
        </div>
      )}

      {!canUpload &&
        pressPhotos.length >= MAX_PRESS_PHOTOS &&
        remainingSlots === 0 && (
          <p className='text-[11px] text-tertiary-token'>
            Remove a photo to upload another.
          </p>
        )}
      {!canUpload &&
        pressPhotos.length >= MAX_PRESS_PHOTOS &&
        remainingSlots > 0 && (
          <p className='text-[11px] text-tertiary-token'>
            {remainingSlots} upload {remainingSlots === 1 ? 'slot' : 'slots'}{' '}
            remaining.
          </p>
        )}

      {uploadError && <p className='text-[11px] text-danger'>{uploadError}</p>}

      <input
        ref={fileInputRef}
        type='file'
        accept='image/*,.heic,.heif'
        className='sr-only'
        onChange={event => {
          handleSelectFile(event);
        }}
      />
    </DrawerSection>
  );
}

export function ProfileAboutTab({
  bio,
  genres,
  location,
  hometown,
  activeSinceYear,
  allowPhotoDownloads,
  showOldReleases,
  pressPhotos = [],
  onBioChange,
  onLocationChange,
  onHometownChange,
  onGenresChange,
  onPressPhotoUpload,
  onPressPhotoDelete,
  onPressPhotoApprove,
}: ProfileAboutTabProps) {
  const hasGenres = genres && genres.length > 0;
  const hasMetadata =
    Boolean(location) || Boolean(hometown) || Boolean(activeSinceYear);
  const editable = Boolean(onLocationChange);

  return (
    <div className='space-y-4'>
      {/* Consolidated detail card: Bio + Location/Hometown + Genres */}
      <div className={cn(LINEAR_SURFACE.drawerCard, 'space-y-3 p-3')}>
        {/* Bio */}
        <div className='space-y-1.5'>
          <DetailLabel>Bio</DetailLabel>
          {onBioChange && <EditableBio value={bio} onChange={onBioChange} />}
          {!onBioChange && bio && (
            <p className='whitespace-pre-wrap text-[12.5px] leading-relaxed text-secondary-token'>
              {bio}
            </p>
          )}
          {!onBioChange && !bio && (
            <p className='text-xs text-tertiary-token'>
              No bio yet. Use the chat to generate one.
            </p>
          )}
        </div>

        {/* Location + Hometown side-by-side */}
        {(hasMetadata || editable) && (
          <div className='space-y-2'>
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2'>
              <div className='space-y-1'>
                <DetailLabel>Location</DetailLabel>
                <LocationField
                  icon={MapPin}
                  value={location}
                  label={v => v}
                  addLabel='Location'
                  onChange={onLocationChange}
                />
              </div>
              <div className='space-y-1'>
                <DetailLabel>Hometown</DetailLabel>
                <LocationField
                  icon={Home}
                  value={hometown}
                  label={v => v}
                  addLabel='Hometown'
                  onChange={onHometownChange}
                />
              </div>
            </div>

            {Boolean(activeSinceYear) && (
              <div className='space-y-1' data-testid='active-since'>
                <DetailLabel>Active Since</DetailLabel>
                <div className='flex items-center gap-2 text-xs text-secondary-token'>
                  <Calendar
                    className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
                    aria-hidden='true'
                  />
                  <span>{activeSinceYear}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Genres */}
        <div className='space-y-1.5'>
          <DetailLabel>Genres</DetailLabel>
          {hasGenres && (
            <div className='flex flex-wrap gap-1.5'>
              {genres.map(genre => (
                <Badge
                  key={genre}
                  variant='secondary'
                  className='gap-1 capitalize'
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
                      className='inline-flex items-center gap-0.5 rounded-full border border-dashed border-subtle px-2.5 py-0.5 text-[11px] font-medium text-tertiary-token transition-colors hover:border-secondary-token hover:text-secondary-token'
                    >
                      <Plus className='h-3 w-3' />
                      Add
                    </button>
                  }
                />
              )}
            </div>
          )}
          {!hasGenres && onGenresChange && (
            <GenrePicker
              selected={[]}
              onChange={onGenresChange}
              trigger={
                <button
                  type='button'
                  className='flex items-center gap-1.5 text-xs text-tertiary-token transition-colors hover:text-secondary-token'
                >
                  <Plus className='h-3.5 w-3.5' />
                  <span>Add genres</span>
                </button>
              }
            />
          )}
          {!hasGenres && !onGenresChange && (
            <p className='text-xs text-tertiary-token'>
              Auto-detected from your music connections.
            </p>
          )}
        </div>
      </div>

      {(pressPhotos.length > 0 || onPressPhotoUpload || onPressPhotoDelete) && (
        <PressPhotosSection
          pressPhotos={pressPhotos}
          onUpload={onPressPhotoUpload}
          onDelete={onPressPhotoDelete}
          onApprove={onPressPhotoApprove}
        />
      )}

      <DrawerSection
        title='Settings'
        collapsible={false}
        className={cn(LINEAR_SURFACE.drawerCard, 'space-y-2 p-3')}
      >
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
        <DrawerAsyncToggle
          label='Show releases older than 90 days'
          ariaLabel='Keep showing releases older than 90 days on your public profile'
          checked={showOldReleases}
          onToggle={updateShowOldReleases}
          testId='profile-contact-lower-settings-control'
          successMessage={on =>
            on
              ? 'Old releases will stay visible on your profile'
              : 'Releases older than 90 days will be hidden'
          }
        />
      </DrawerSection>
    </div>
  );
}
