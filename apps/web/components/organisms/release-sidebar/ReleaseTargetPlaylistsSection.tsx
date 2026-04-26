'use client';

import { Input } from '@jovie/ui';
import { Loader2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DrawerSurfaceCard } from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';

interface ReleaseTargetPlaylistsSectionProps {
  readonly releaseId: string;
  readonly targetPlaylists?: string[];
  readonly onSave?: (releaseId: string, playlists: string[]) => Promise<void>;
  readonly readOnly?: boolean;
  readonly variant?: 'card' | 'flat';
}

function parsePlaylistInput(value: string): string[] {
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function joinPlaylists(playlists: string[] | undefined): string {
  return playlists?.join(', ') ?? '';
}

export function ReleaseTargetPlaylistsSection({
  releaseId,
  targetPlaylists,
  onSave,
  readOnly = false,
  variant = 'card',
}: ReleaseTargetPlaylistsSectionProps) {
  const initialValue = joinPlaylists(targetPlaylists);
  const [value, setValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const lastSavedRef = useRef(initialValue);

  const handleBlur = useCallback(async () => {
    if (!onSave || readOnly) return;

    const parsed = parsePlaylistInput(value).slice(0, 5);
    const currentJoined = parsed.join(', ');

    // Dirty check: don't save if unchanged
    if (currentJoined === lastSavedRef.current) return;

    setIsSaving(true);
    try {
      await onSave(releaseId, parsed);
      setValue(currentJoined);
      lastSavedRef.current = currentJoined;
    } catch {
      toast.error('Failed to save target playlists');
    } finally {
      setIsSaving(false);
    }
  }, [onSave, readOnly, value, releaseId]);

  return (
    <DrawerSurfaceCard
      variant={variant}
      className={cn(
        variant === 'card' && LINEAR_SURFACE.drawerCardSm,
        'space-y-2.5',
        variant === 'card' && 'p-3'
      )}
      testId='release-target-playlists-card'
    >
      <div className='flex items-center justify-between'>
        <label
          htmlFor={`target-playlists-${releaseId}`}
          className='text-2xs font-medium text-secondary-token'
        >
          Target Playlists
        </label>
        {isSaving && (
          <Loader2 className='h-3 w-3 animate-spin text-tertiary-token' />
        )}
      </div>
      <p
        id={`target-playlists-helper-${releaseId}`}
        className='text-2xs leading-[15px] text-tertiary-token'
      >
        Playlists you&apos;re targeting for this release. Leave blank to use
        your defaults.
      </p>
      <Input
        type='text'
        id={`target-playlists-${releaseId}`}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder='e.g. Pollen, Butter, Lorem'
        maxLength={310}
        disabled={readOnly}
        aria-describedby={`target-playlists-helper-${releaseId}`}
        className='h-8 w-full rounded-full border-subtle bg-surface-0 text-xs'
        data-testid={`target-playlists-input-${releaseId}`}
      />
    </DrawerSurfaceCard>
  );
}
