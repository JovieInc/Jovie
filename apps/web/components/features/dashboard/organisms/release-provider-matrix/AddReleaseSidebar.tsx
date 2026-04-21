'use client';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui/atoms/popover';
import { format, isValid, parse, startOfToday, subDays } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { createRelease } from '@/app/app/(shell)/dashboard/releases/actions';
import { Calendar } from '@/components/atoms/Calendar';
import { Icon } from '@/components/atoms/Icon';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import {
  DrawerButton,
  DrawerCardActionBar,
  DrawerFormField,
  DrawerSettingsToggle,
  DrawerSurfaceCard,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { GenrePicker } from '@/components/molecules/GenrePicker';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { ReleaseFields } from '@/components/organisms/release-sidebar/ReleaseFields';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

const RELEASE_TYPE_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'ep', label: 'EP' },
  { value: 'album', label: 'Album' },
  { value: 'compilation', label: 'Compilation' },
  { value: 'live', label: 'Live' },
] as const;

type ReleaseType = (typeof RELEASE_TYPE_OPTIONS)[number]['value'];

function parseDateValue(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, 'yyyy-MM-dd', new Date(0));
  return isValid(parsed) ? parsed : undefined;
}

function formatDateValue(value: string): string {
  const parsed = parseDateValue(value);
  return parsed ? format(parsed, 'MMM d, yyyy') : 'Pick a date';
}

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
  const [revealDate, setRevealDate] = useState('');
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

  // Show reveal date field when release date is in the future
  const isFutureRelease = useMemo(() => {
    const parsedReleaseDate = parseDateValue(releaseDate);
    return parsedReleaseDate ? parsedReleaseDate > startOfToday() : false;
  }, [releaseDate]);

  // Auto-calculate reveal date default (30 days before release)
  const autoRevealDate = useMemo(() => {
    const parsedReleaseDate = parseDateValue(releaseDate);
    if (!parsedReleaseDate || !isFutureRelease) return '';

    const today = startOfToday();
    const suggestedRevealDate = subDays(parsedReleaseDate, 30);
    const effective = suggestedRevealDate > today ? suggestedRevealDate : today;

    return format(effective, 'yyyy-MM-dd');
  }, [releaseDate, isFutureRelease]);

  // Auto-set reveal date when release date changes (only if user hasn't manually set one)
  const [revealDateManuallySet, setRevealDateManuallySet] = useState(false);
  useEffect(() => {
    if (!revealDateManuallySet && autoRevealDate) {
      setRevealDate(autoRevealDate);
    }
  }, [autoRevealDate, revealDateManuallySet]);

  const replaceStagedArtworkPreview = useCallback((nextUrl: string | null) => {
    setStagedArtworkPreviewUrl(nextUrl);
  }, []);

  const resetForm = useCallback(() => {
    setTitle('');
    setReleaseType('single');
    setReleaseDate('');
    setRevealDate('');
    setRevealDateManuallySet(false);
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
        revealDate: revealDate || null,
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
    revealDate,
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
      scrollStrategy='shell'
      onClose={handleClose}
      headerMode='minimal'
      hideMinimalHeaderBar
      footerSurface='flat'
      footer={
        <DrawerButton
          tone='secondary'
          className='h-8 w-full justify-center border-white bg-white text-black hover:border-white hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:border-white disabled:bg-white disabled:text-black/55 disabled:opacity-100'
          onClick={handleSubmit}
          disabled={isSubmitting || !title.trim()}
        >
          {isSubmitting ? (
            <>
              <LoadingSpinner size='sm' className='mr-2' />
              Creating...
            </>
          ) : (
            'Create Release'
          )}
        </DrawerButton>
      }
      entityHeader={
        <DrawerSurfaceCard
          variant='card'
          className='overflow-hidden'
          testId='add-release-header-card'
        >
          <div className='p-3'>
            <EntityHeaderCard
              eyebrow='Release preview'
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
              subtitle={
                artistName ? <span>{artistName}</span> : 'No artist selected'
              }
              actions={
                <DrawerCardActionBar
                  primaryActions={[]}
                  onClose={handleClose}
                  overflowTriggerPlacement='card-top-right'
                  overflowTriggerIcon='vertical'
                  className='border-0 bg-transparent px-0 py-0'
                />
              }
              meta={
                <ReleaseFields
                  releaseDate={releaseDate || undefined}
                  releaseType={releaseType}
                  totalTracks={releaseType === 'single' ? 1 : undefined}
                />
              }
              className='min-w-0 flex-1'
              bodyClassName='pr-9'
              data-testid='entity-header-card'
            />
          </div>
        </DrawerSurfaceCard>
      }
    >
      <DrawerSurfaceCard variant='card' className='overflow-hidden'>
        <div className='space-y-3.5 p-3' data-testid='add-release-details-card'>
          <p className='text-[11px] font-[560] leading-none tracking-[-0.01em] text-tertiary-token'>
            Details
          </p>

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
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id='release-date'
                  type='button'
                  variant='outline'
                  className={cn(
                    'h-[32px] w-full justify-start gap-2 rounded-[8px] border-subtle bg-surface-0 px-3 text-[12px] font-normal',
                    !releaseDate && 'text-tertiary-token'
                  )}
                >
                  <CalendarIcon className='h-3.5 w-3.5 shrink-0' />
                  <span>{formatDateValue(releaseDate)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-auto p-0' align='start'>
                <Calendar
                  mode='single'
                  selected={parseDateValue(releaseDate)}
                  onSelect={date => {
                    if (!date) return;
                    setReleaseDate(format(date, 'yyyy-MM-dd'));
                    setRevealDateManuallySet(false);
                  }}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </DrawerFormField>

          {isFutureRelease && (
            <DrawerFormField label='Reveal Date' htmlFor='reveal-date'>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id='reveal-date'
                    type='button'
                    variant='outline'
                    className={cn(
                      'h-[32px] w-full justify-start gap-2 rounded-[8px] border-subtle bg-surface-0 px-3 text-[12px] font-normal',
                      !revealDate && 'text-tertiary-token'
                    )}
                  >
                    <CalendarIcon className='h-3.5 w-3.5 shrink-0' />
                    <span>{formatDateValue(revealDate)}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={parseDateValue(revealDate)}
                    onSelect={date => {
                      if (!date) return;
                      setRevealDate(format(date, 'yyyy-MM-dd'));
                      setRevealDateManuallySet(true);
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
              <p className='mt-1 text-[11px] text-tertiary-token'>
                Details hidden until this date (mystery page)
              </p>
            </DrawerFormField>
          )}

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
                          className='rounded-full bg-surface-1 px-2 py-0.5 text-[11px] capitalize text-secondary-token'
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
