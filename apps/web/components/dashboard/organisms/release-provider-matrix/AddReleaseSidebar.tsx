'use client';

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { createRelease } from '@/app/app/(shell)/dashboard/releases/actions';
import { Icon } from '@/components/atoms/Icon';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import {
  DrawerButton,
  DrawerFormField,
  DrawerMediaThumb,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';

const RELEASE_TYPE_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'ep', label: 'EP' },
  { value: 'album', label: 'Album' },
  { value: 'compilation', label: 'Compilation' },
  { value: 'live', label: 'Live' },
] as const;

type ReleaseType = (typeof RELEASE_TYPE_OPTIONS)[number]['value'];

const PROVIDER_FIELDS = [
  {
    key: 'spotify',
    label: 'Spotify',
    placeholder: 'https://open.spotify.com/album/...',
  },
  {
    key: 'apple_music',
    label: 'Apple Music',
    placeholder: 'https://music.apple.com/...',
  },
  {
    key: 'youtube_music',
    label: 'YouTube Music',
    placeholder: 'https://music.youtube.com/...',
  },
  { key: 'tidal', label: 'Tidal', placeholder: 'https://tidal.com/...' },
  {
    key: 'amazon_music',
    label: 'Amazon Music',
    placeholder: 'https://music.amazon.com/...',
  },
  {
    key: 'soundcloud',
    label: 'SoundCloud',
    placeholder: 'https://soundcloud.com/...',
  },
  { key: 'deezer', label: 'Deezer', placeholder: 'https://www.deezer.com/...' },
] as const;

export interface AddReleaseSidebarProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}

export function AddReleaseSidebar({
  isOpen,
  onClose,
  onCreated,
}: AddReleaseSidebarProps) {
  const [title, setTitle] = useState('');
  const [releaseType, setReleaseType] = useState<ReleaseType>('single');
  const [releaseDate, setReleaseDate] = useState('');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [providerUrls, setProviderUrls] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setTitle('');
    setReleaseType('single');
    setReleaseDate('');
    setArtworkUrl('');
    setProviderUrls({});
  }, []);

  const handleProviderUrlChange = useCallback((key: string, value: string) => {
    setProviderUrls(prev => ({ ...prev, [key]: value }));
  }, []);

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
        artworkUrl: artworkUrl.trim() || null,
        providerUrls,
      });

      if (result.success) {
        toast.success(result.message);
        resetForm();
        onCreated();
        onClose();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Failed to create release. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    title,
    releaseType,
    releaseDate,
    artworkUrl,
    providerUrls,
    resetForm,
    onCreated,
    onClose,
  ]);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Add release'
      data-testid='add-release-sidebar'
      title='Add Release'
      onClose={handleClose}
      entityHeader={
        <EntityHeaderCard
          image={
            <DrawerMediaThumb
              alt='New release artwork'
              sizeClassName='h-10 w-10'
              fallback={
                <Icon
                  name='Disc3'
                  className='h-5 w-5 text-(--linear-text-tertiary)'
                  aria-hidden='true'
                />
              }
            />
          }
          title={title || 'New Release'}
          subtitle={
            RELEASE_TYPE_OPTIONS.find(o => o.value === releaseType)?.label ??
            'Single'
          }
          className='gap-2'
        />
      }
      footer={
        <DrawerButton
          tone='primary'
          className='w-full'
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
      }
    >
      <div className='space-y-5'>
        <DrawerFormField label='Title' htmlFor='release-title'>
          <Input
            id='release-title'
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder='My New Release'
            autoFocus
          />
        </DrawerFormField>

        <DrawerFormField label='Release Type' htmlFor='release-type'>
          <Select
            value={releaseType}
            onValueChange={v => setReleaseType(v as ReleaseType)}
          >
            <SelectTrigger id='release-type'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RELEASE_TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
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
            onChange={e => setReleaseDate(e.target.value)}
          />
        </DrawerFormField>

        <DrawerFormField label='Artwork URL (optional)' htmlFor='artwork-url'>
          <Input
            id='artwork-url'
            type='url'
            value={artworkUrl}
            onChange={e => setArtworkUrl(e.target.value)}
            placeholder='https://example.com/artwork.jpg'
          />
        </DrawerFormField>

        <div className='space-y-3'>
          <p className='text-[11px] font-[510] tracking-[-0.01em] text-(--linear-text-secondary)'>
            Platform Links (optional)
          </p>
          {PROVIDER_FIELDS.map(provider => (
            <DrawerFormField
              key={provider.key}
              label={provider.label}
              htmlFor={`provider-${provider.key}`}
              className='space-y-1'
            >
              <Input
                id={`provider-${provider.key}`}
                type='url'
                value={providerUrls[provider.key] ?? ''}
                onChange={e =>
                  handleProviderUrlChange(provider.key, e.target.value)
                }
                placeholder={provider.placeholder}
              />
            </DrawerFormField>
          ))}
        </div>
      </div>
    </EntitySidebarShell>
  );
}
