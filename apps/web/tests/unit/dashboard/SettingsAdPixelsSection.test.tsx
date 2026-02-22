import { describe, expect, it, vi } from 'vitest';
import { SettingsAdPixelsSection } from '@/components/dashboard/organisms/SettingsAdPixelsSection';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');

  return {
    ...actual,
    Switch: ({ checked }: { checked: boolean }) => (
      <button type='button' aria-label='Enable pixel tracking'>
        {checked ? 'on' : 'off'}
      </button>
    ),
  };
});

vi.mock('@/lib/queries', () => ({
  usePixelSettingsMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      pixels: {
        facebookPixelId: '1234567890123456',
        googleMeasurementId: 'G-ABCD1234EF',
        tiktokPixelId: null,
        enabled: true,
        facebookEnabled: true,
        googleEnabled: true,
        tiktokEnabled: false,
      },
      hasTokens: {
        facebook: true,
        google: true,
        tiktok: false,
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

describe('SettingsAdPixelsSection', () => {
  it('renders each retargeting platform as a separate setting card with status', () => {
    const { getByText, getAllByText } = fastRender(
      <SettingsAdPixelsSection isPro />
    );

    expect(
      getByText('Configure each retargeting destination independently.')
    ).toBeDefined();

    expect(getByText('Facebook Conversions API')).toBeDefined();
    expect(
      getByText('Google Analytics 4 (Measurement Protocol)')
    ).toBeDefined();
    expect(getByText('TikTok Events API')).toBeDefined();

    expect(getAllByText('Configured')).toHaveLength(2);
    expect(getAllByText('Not configured')).toHaveLength(1);
  });
});
