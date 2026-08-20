import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsAnalyticsSection } from '@/features/dashboard/organisms/SettingsAnalyticsSection';
import type { Artist } from '@/types/db';

interface ToggleConfig {
  readonly initialValue: boolean;
  readonly syncKey?: string | number | null;
  readonly mutateAsync: (enabled: boolean) => Promise<unknown>;
  readonly onOptimisticUpdate?: (enabled: boolean) => void;
  readonly errorMessage: string;
  readonly showErrorToast?: boolean;
}

const { toggleConfigs, updateAnalyticsFilterAsync } = vi.hoisted(() => ({
  toggleConfigs: [] as ToggleConfig[],
  updateAnalyticsFilterAsync: vi.fn(),
}));

vi.mock('@/features/dashboard/hooks/useOptimisticToggle', () => ({
  useOptimisticToggle: (config: ToggleConfig) => {
    toggleConfigs.push(config);
    return {
      checked: config.initialValue,
      handleToggle: vi.fn(),
      isPending: false,
      saveStatus: { saving: false, success: null, error: null },
    };
  },
}));

vi.mock('@/lib/queries', () => ({
  useAnalyticsFilterMutation: () => ({ updateAnalyticsFilterAsync }),
}));

const artist = {
  id: 'profile-1',
  settings: { exclude_self_from_analytics: false },
} as Artist;

describe('analytics settings anatomy', () => {
  beforeEach(() => {
    toggleConfigs.length = 0;
    updateAnalyticsFilterAsync.mockReset();
  });

  it('preserves the analytics gate and mutation plus optimistic payloads', async () => {
    const onArtistUpdate = vi.fn();
    const { rerender } = render(
      <TooltipProvider>
        <SettingsAnalyticsSection
          artist={artist}
          isPro={false}
          onArtistUpdate={onArtistUpdate}
        />
      </TooltipProvider>
    );

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('Traffic Quality Filtering')).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <SettingsAnalyticsSection
          artist={artist}
          isPro
          onArtistUpdate={onArtistUpdate}
        />
      </TooltipProvider>
    );
    expect(
      screen.getByRole('switch', {
        name: 'Traffic Quality Filtering',
      })
    ).toBeEnabled();

    const config = toggleConfigs.at(-1);
    expect(config).toMatchObject({
      initialValue: false,
      syncKey: 'profile-1',
      errorMessage: 'Failed to update analytics filter.',
      showErrorToast: false,
    });
    await config?.mutateAsync(true);
    config?.onOptimisticUpdate?.(true);

    expect(updateAnalyticsFilterAsync).toHaveBeenCalledExactlyOnceWith(true);
    expect(onArtistUpdate).toHaveBeenCalledExactlyOnceWith({
      ...artist,
      settings: {
        ...artist.settings,
        exclude_self_from_analytics: true,
      },
    });
  });
});
