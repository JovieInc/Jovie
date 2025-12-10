'use client';

import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Icon } from '@/components/atoms/Icon';
import { useNotifications } from '@/lib/hooks/useNotifications';

type IngestPlatform = 'linktree' | 'beacons' | 'instagram';

interface PlatformOption {
  id: IngestPlatform;
  label: string;
  placeholder: string;
  enabled: boolean;
}

const PLATFORM_OPTIONS: PlatformOption[] = [
  {
    id: 'linktree',
    label: 'Linktree',
    placeholder: 'https://linktr.ee/username',
    enabled: true,
  },
  {
    id: 'beacons',
    label: 'Beacons',
    placeholder: 'https://beacons.ai/username',
    enabled: false,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    placeholder: 'https://instagram.com/username',
    enabled: false,
  },
];

const PLATFORM_PREFIX: Record<IngestPlatform, string> = {
  linktree: 'https://linktr.ee/',
  beacons: 'https://beacons.ai/',
  instagram: 'https://instagram.com/',
};

export function IngestProfileDropdown() {
  const router = useRouter();
  const notifications = useNotifications();

  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [urlOverride, setUrlOverride] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] =
    useState<IngestPlatform>('linktree');
  const [isLoading, setIsLoading] = useState(false);

  const currentPlatform = PLATFORM_OPTIONS.find(p => p.id === selectedPlatform);

  const effectiveUrl = useMemo(() => {
    if (urlOverride) return urlOverride.trim();
    const prefix = PLATFORM_PREFIX[selectedPlatform];
    const trimmed = username.trim().replace(/^@/, '');
    return trimmed ? `${prefix}${trimmed}` : '';
  }, [selectedPlatform, urlOverride, username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!effectiveUrl) {
      notifications.error('Please enter a handle');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/creator-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: effectiveUrl }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        profile?: { id: string; username: string };
        links?: number;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to ingest profile');
      }

      const profileUsername = result.profile?.username;
      const successMessage = profileUsername
        ? `Created creator profile @${profileUsername}`
        : 'Created new creator profile';

      notifications.success(successMessage, {
        action: profileUsername
          ? {
              label: 'View profile',
              onClick: () => router.push(`/${profileUsername}`),
            }
          : undefined,
      });

      setUsername('');
      setUrlOverride(null);
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Ingestion error', error);
      notifications.error(
        error instanceof Error ? error.message : 'Failed to ingest profile'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type='button' size='sm' variant='secondary'>
          <Icon name='Plus' className='h-4 w-4 mr-2' />
          Ingest Profile
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-80 p-0'>
        <div className='p-4 space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-sm font-semibold text-primary-token'>
                Ingest profile
              </p>
              <p className='text-xs text-secondary-token'>
                Import from external platform (auto-builds URL)
              </p>
            </div>
            <Badge
              variant='secondary'
              size='sm'
              className='uppercase text-[10px]'
            >
              Admin
            </Badge>
          </div>

          {/* Platform selector */}
          <div className='flex gap-1'>
            {PLATFORM_OPTIONS.map(platform => (
              <button
                key={platform.id}
                type='button'
                disabled={!platform.enabled}
                onClick={() => setSelectedPlatform(platform.id)}
                className={`
                  px-3 py-1.5 text-xs font-medium rounded-full transition-colors
                  ${
                    selectedPlatform === platform.id
                      ? 'bg-primary text-primary-foreground'
                      : platform.enabled
                        ? 'bg-surface-2 text-secondary-token hover:bg-surface-3'
                        : 'bg-surface-2/50 text-tertiary-token cursor-not-allowed opacity-50'
                  }
                `}
              >
                {platform.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className='space-y-3'>
            <div className='space-y-1'>
              <Input
                type='text'
                placeholder='username'
                value={username}
                onChange={e => {
                  setUsername(e.target.value);
                  setUrlOverride(null);
                }}
                disabled={isLoading}
                autoFocus
                className='w-full'
              />
              <p className='text-xs text-secondary-token'>
                {currentPlatform?.label} URL:{' '}
                <span className='font-mono'>{effectiveUrl || '—'}</span>
              </p>
            </div>

            <div className='space-y-1'>
              <label className='text-xs text-secondary-token'>
                Or paste full URL
              </label>
              <Input
                type='url'
                placeholder={currentPlatform?.placeholder}
                value={urlOverride ?? ''}
                onChange={e => setUrlOverride(e.target.value || null)}
                disabled={isLoading}
                className='w-full'
              />
            </div>

            <div className='flex justify-end gap-2'>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                size='sm'
                variant='primary'
                disabled={isLoading || !effectiveUrl}
              >
                {isLoading ? 'Ingesting...' : 'Ingest'}
              </Button>
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
