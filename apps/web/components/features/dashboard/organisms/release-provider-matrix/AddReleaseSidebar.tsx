'use client';

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createRelease } from '@/app/app/(shell)/dashboard/releases/actions';
import { Icon } from '@/components/atoms/Icon';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import {
  DrawerButton,
  DrawerFormField,
  DrawerSettingsToggle,
  DrawerSurfaceCard,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { GenrePicker } from '@/components/molecules/GenrePicker';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { ReleaseFields } from '@/components/organisms/release-sidebar/ReleaseFields';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

const RELEASE_TYPE_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'ep', label: 'EP' },
  { value: 'album', label: 'Album' },
  { value: 'compilation', label: 'Compilation' },
  { value: 'live', label: 'Live' },
] as const;

const ADD_RELEASE_CARD_CLASSNAME = cn(
  LINEAR_SURFACE.sidebarCard,
  'overflow-hidden bg-surface-1'
);

type ReleaseType = (typeof RELEASE_TYPE_OPTIONS)[number]['value'];

export interface AddReleaseSidebarProps {
  readonly isOpen: boolean;
  readonly artistName?: string | null;
  readonly onClose: () => void;
  readonly onCreated: (release: ReleaseViewModel) => void;
  readonly onArtworkUploaded?: (releaseId: string, artworkUrl: string) => void;
}

export function AddReleaseSidebar({
  isOpen,
  artistName,
  onClose,
  onCreated,
  onArtworkUploaded,
}: AddReleaseSidebarProps) {
  const [title, setTitle] = useState('');
  const [releaseType, setReleaseType] = useState<ReleaseType>('single');
  const [releaseDate, setReleaseDate] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [isExplicit, setIsExplicit] = useState(false);
  const [stagedArtworkFile, setStagedArtworkFile] = useState<File | null>(null);
  const [stagedArtworkPreviewUrl, setStagedArtworkPreviewUrl] = useState<
    string | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const releaseTypeLabel =
    RELEASE_TYPE_OPTIONS.find(option => option.value === releaseType)?.label ??
    'Single';

  const replaceStagedArtworkPreview = useCallback((nextUrl: string | null) => {
    setStagedArtworkPreviewUrl(nextUrl);
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setReleaseType('single');
    setReleaseDate('');
    setGenres([]);
    setIsExplicit(false);
    setStagedArtworkFile(null);
    replaceStagedArtworkPreview(null);
  }, [replaceStagedArtworkPreview]);

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen, resetForm]);

  useEffect(() => {
    return () => {
      if (stagedArtworkPreviewUrl) {
        URL.revokeObjectURL(stagedArtworkPreviewUrl);
      }
    };
  }, [stagedArtworkPreviewUrl]);

  const handleArtworkStage = useCallback(
    async (file: File) => {
      const previewUrl = URL.createObjectURL(file);
      setStagedArtworkFile(file);
      replaceStagedArtworkPreview(previewUrl);
      return previewUrl;
    },
    [replaceStagedArtworkPreview]
  );

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      toast.error('Title is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createRelease({
        title: title.trim(),
        releaseType,
        releaseDate: releaseDate || null,
        genres,
        isExplicit,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      if (!result.release || !result.releaseId) {
        toast.error('Release created, but the editor could not be opened.');
        return;
      }

      const releaseId = result.releaseId;
      const artworkFile = stagedArtworkFile;
      const createdRelease = result.release;

      toast.success(result.message);
      resetForm();
      onCreated(createdRelease);
      onClose();

      if (artworkFile) {
        void (async () => {
          const formData = new FormData();
          formData.append('file', artworkFile);

          try {
            const response = await fetch(
              `/api/images/artwork/upload?releaseId=${encodeURIComponent(releaseId)}`,
              {
                method: 'POST',
                body: formData,
              }
            );

            if (!response.ok) {
              const error = await response
                .json()
                .catch(() => ({ message: 'Upload failed' }));
              throw new Error(error.message ?? 'Failed to upload artwork');
            }

            const uploadResult = (await response.json()) as {
              artworkUrl?: string;
            };

            if (uploadResult.artworkUrl) {
              onArtworkUploaded?.(createdRelease.id, uploadResult.artworkUrl);
            }
          } catch {
            toast.warning(
              'Release created, but artwork upload failed. You can retry from the release drawer.'
            );
          }
        })();
      }
    } catch {
      toast.error('Failed to create release. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    genres,
    isExplicit,
    onClose,
    onCreated,
    onArtworkUploaded,
    releaseDate,
    releaseType,
    resetForm,
    stagedArtworkFile,
    title,
  ]);

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    resetForm();
    onClose();
  }, [isSubmitting, onClose, resetForm]);

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Add release'
      data-testid='add-release-sidebar'
      title='New Release'
      onClose={handleClose}
      headerMode='minimal'
      entityHeader={
        <DrawerSurfaceCard
          className={ADD_RELEASE_CARD_CLASSNAME}
          testId='add-release-header-card'
        >
          <div className='p-2.5'>
            <p className='mb-1 text-[10.5px] font-[510] leading-none text-tertiary-token'>
              New Release
            </p>
            <EntityHeaderCard
              image={
                <AvatarUploadable
                  src={stagedArtworkPreviewUrl}
                  alt={title ? `${title} artwork` : 'New release artwork'}
                  name={title || 'Untitled'}
                  size='2xl'
                  rounded='md'
                  uploadable
                  onUpload={handleArtworkStage}
                  showHoverOverlay
                />
              }
              title={title || 'Untitled'}
              subtitle={artistName ? <span>{artistName}</span> : null}
              meta={
                <ReleaseFields
                  releaseDate={releaseDate || undefined}
                  releaseType={releaseType}
                  totalTracks={releaseType === 'single' ? 1 : undefined}
                />
              }
              className='min-w-0 flex-1'
              bodyClassName='pt-0'
              data-testid='entity-header-card'
            />
          </div>
          <div className='border-t border-subtle px-3.5 py-2'>
            <DrawerButton
              tone='primary'
              className='h-8 w-full'
              onClick={handleSubmit}
              disabled={isSubmitting || !title.trim()}
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size='sm' tone='inverse' className='mr-2' />
                  Creating...
                </>
              ) : (
                'Create Release'
              )}
            </DrawerButton>
          </div>
        </DrawerSurfaceCard>
      }
    >
      <DrawerSurfaceCard className={ADD_RELEASE_CARD_CLASSNAME}>
        <div className='border-b border-subtle px-3.5 py-2'>
          <p className='text-[11px] font-[510] leading-none text-tertiary-token'>
            Details
          </p>
        </div>
        <div className='space-y-3.5 p-3.5'>
          <DrawerFormField label='Title' htmlFor='release-title'>
            <Input
              id='release-title'
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder='My New Release'
              autoFocus
              className='h-[32px] rounded-[8px] border-subtle bg-surface-0 text-[12px]'
            />
          </DrawerFormField>

          <DrawerFormField label='Release Type' htmlFor='release-type'>
            <Select
              value={releaseType}
              onValueChange={value => setReleaseType(value as ReleaseType)}
            >
              <SelectTrigger
                id='release-type'
                className='h-[32px] rounded-[8px] border-subtle bg-surface-0 text-[12px]'
              >
                <SelectValue>{releaseTypeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RELEASE_TYPE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DrawerFormField>

          <DrawerFormField label='Release Date' htmlFor='release-date'>
            <Input
              id='release-date'
              type='date'
              value={releaseDate}
              onChange={event => setReleaseDate(event.target.value)}
              className='h-[32px] rounded-[8px] border-subtle bg-surface-0 text-[12px]'
            />
          </DrawerFormField>

          <DrawerFormField label='Genres'>
            <GenrePicker
              selected={genres}
              onChange={setGenres}
              trigger={
                <button
                  type='button'
                  className='flex min-h-[32px] w-full items-center justify-between gap-2 rounded-[8px] border border-subtle bg-surface-0 px-3 py-1.5 text-left text-[12px] text-primary-token transition-[border-color,background-color,color] duration-150 hover:border-default hover:bg-surface-1'
                >
                  <span className='flex min-w-0 flex-1 flex-wrap gap-1.5'>
                    {genres.length > 0 ? (
                      genres.map(genre => (
                        <span
                          key={genre}
                          className='rounded-full bg-surface-1 px-2 py-0.5 text-[10.5px] capitalize text-secondary-token'
                        >
                          {genre}
                        </span>
                      ))
                    ) : (
                      <span className='text-tertiary-token'>Add genres...</span>
                    )}
                  </span>
                  <Icon
                    name='ChevronDown'
                    className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
                    aria-hidden='true'
                  />
                </button>
              }
            />
          </DrawerFormField>

          <DrawerSettingsToggle
            label='Explicit'
            checked={isExplicit}
            onCheckedChange={setIsExplicit}
            ariaLabel='Mark release as explicit'
          />
        </div>
      </DrawerSurfaceCard>
    </EntitySidebarShell>
  );
}
