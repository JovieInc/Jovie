'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  type LeadPipelineSettings,
  queryKeys,
  useLeadPipelineSettingsQuery,
  useUpdateLeadPipelineSettingsMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

const SPEED_OPTIONS = ['off', 'test', 'normal', 'fast'] as const;
type Speed = (typeof SPEED_OPTIONS)[number];
type SpeedOrCustom = Speed | 'custom';

const SPEED_LABELS: Record<Speed, string> = {
  off: 'Off',
  test: 'Test (5/day)',
  normal: 'Normal (25/day)',
  fast: 'Fast (100/day)',
};

const SPEED_PRESETS: Record<Speed, Partial<LeadPipelineSettings>> = {
  off: {
    enabled: false,
    discoveryEnabled: false,
    autoIngestEnabled: false,
    dailySendCap: 1,
    maxPerHour: 1,
    dailyQueryBudget: 1,
  },
  test: {
    enabled: true,
    discoveryEnabled: true,
    autoIngestEnabled: true,
    dailySendCap: 5,
    maxPerHour: 2,
    dailyQueryBudget: 25,
  },
  normal: {
    enabled: true,
    discoveryEnabled: true,
    autoIngestEnabled: true,
    dailySendCap: 25,
    maxPerHour: 10,
    dailyQueryBudget: 100,
  },
  fast: {
    enabled: true,
    discoveryEnabled: true,
    autoIngestEnabled: true,
    dailySendCap: 100,
    maxPerHour: 25,
    dailyQueryBudget: 300,
  },
};

const PRESET_FIELDS = [
  'enabled',
  'discoveryEnabled',
  'autoIngestEnabled',
  'dailySendCap',
  'maxPerHour',
  'dailyQueryBudget',
] as const;

export function detectSpeed(settings: LeadPipelineSettings): SpeedOrCustom {
  for (const speed of SPEED_OPTIONS) {
    const preset = SPEED_PRESETS[speed];
    const matches = PRESET_FIELDS.every(
      field => settings[field] === preset[field]
    );
    if (matches) return speed;
  }
  return 'custom';
}

export function getSpeedPreset(speed: Speed): Partial<LeadPipelineSettings> {
  return SPEED_PRESETS[speed];
}

function SpeedDialSkeleton() {
  return (
    <ContentSurfaceCard className='px-(--linear-app-content-padding-x) py-4'>
      <div className='flex items-center gap-3'>
        <div className='h-8 w-64 animate-pulse rounded-[10px] bg-surface-0' />
      </div>
      <div className='mt-2 h-4 w-48 animate-pulse rounded bg-surface-0' />
    </ContentSurfaceCard>
  );
}

export { SpeedDialSkeleton as GtmSpeedDialSkeleton };

export function GtmSpeedDial() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const settingsQuery = useLeadPipelineSettingsQuery();
  const mutation = useUpdateLeadPipelineSettingsMutation();
  const [optimisticSpeed, setOptimisticSpeed] = useState<SpeedOrCustom | null>(
    null
  );

  // Clear optimistic state once fresh data arrives from the refetch
  useEffect(() => {
    if (settingsQuery.data?.settings) {
      setOptimisticSpeed(null);
    }
  }, [settingsQuery.data]);

  const settings = settingsQuery.data?.settings;

  if (settingsQuery.isLoading) {
    return <SpeedDialSkeleton />;
  }

  if (settingsQuery.isError || !settings) {
    return (
      <ContentSurfaceCard className='px-(--linear-app-content-padding-x) py-4'>
        <p className='text-xs font-book text-destructive'>
          Failed to load pipeline settings.
        </p>
      </ContentSurfaceCard>
    );
  }

  const currentSpeed = optimisticSpeed ?? detectSpeed(settings);

  async function applySpeed(speed: Speed) {
    if (!settings) return;
    const preset = getSpeedPreset(speed);
    setOptimisticSpeed(speed);

    try {
      await mutation.mutateAsync({ ...settings, ...preset });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.admin.leads.settings(),
      });
      router.refresh();
      toast.success(
        speed === 'off' ? 'Pipeline paused' : `Pipeline set to ${speed}`
      );
    } catch {
      setOptimisticSpeed(null);
      toast.error('Failed to update pipeline speed');
    }
  }

  const isActive =
    currentSpeed !== 'off' && currentSpeed !== 'custom'
      ? true
      : currentSpeed === 'custom' && settings.enabled;

  return (
    <ContentSurfaceCard className='px-(--linear-app-content-padding-x) py-4'>
      <div className='flex flex-wrap items-center gap-2'>
        {SPEED_OPTIONS.map(speed => (
          <button
            key={speed}
            type='button'
            onClick={() => void applySpeed(speed)}
            disabled={mutation.isPending}
            aria-pressed={currentSpeed === speed}
            className={cn(
              'rounded-[10px] px-3.5 py-1.5 text-app font-medium transition-colors',
              currentSpeed === speed
                ? 'bg-primary-token text-on-primary'
                : 'bg-surface-0 text-secondary-token hover:text-primary-token hover:bg-surface-0/80'
            )}
          >
            {SPEED_LABELS[speed]}
          </button>
        ))}
        {currentSpeed === 'custom' && (
          <span className='flex items-center gap-2 text-app text-secondary-token'>
            <span className='rounded-[10px] bg-surface-0 px-3 py-1.5 font-medium'>
              Custom: {settings.dailySendCap}/day, {settings.maxPerHour}/hr
            </span>
            <button
              type='button'
              onClick={() => void applySpeed('normal')}
              disabled={mutation.isPending}
              className='text-xs text-accent hover:underline'
            >
              Reset to Normal
            </button>
          </span>
        )}
      </div>
      <p className='mt-2 text-xs font-book text-secondary-token'>
        {isActive ? (
          <>
            <span className='mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success' />
            Pipeline active
            {settings.autoIngestedToday > 0 &&
              ` · ${settings.autoIngestedToday} invited today`}
            {' · '}
            Next run in ~15 min
          </>
        ) : (
          <>
            <span className='mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-tertiary-token' />{' '}
            Pipeline paused
          </>
        )}
      </p>
    </ContentSurfaceCard>
  );
}
