import { describe, expect, it, vi } from 'vitest';
import { SettingsAdPixelsSection } from '@/features/dashboard/organisms/SettingsAdPixelsSection';
import { fastRender } from '@/tests/utils/fast-render';

// Mock @jovie/ui with lightweight stubs instead of vi.importActual (which OOMs)
vi.mock('@jovie/ui', () => ({
  Switch: ({ checked }: { checked: boolean }) => (
    <button type='button' aria-label='Enable pixel tracking'>
      {checked ? 'on' : 'off'}
    </button>
  ),
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid='card' className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h3>{children}</h3>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Button: ({
    children,
    loading: _loading,
    ...props
  }: {
    children: React.ReactNode;
    loading?: boolean;
  }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Label: ({ children }: { children: React.ReactNode }) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: test mock
    <label>{children}</label>
  ),
  Skeleton: () => <div data-testid='skeleton' />,
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const { usePixelSettingsQueryMock } = vi.hoisted(() => {
  const mockPixelSettings = {
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
  };

  return {
    usePixelSettingsQueryMock: vi.fn(() => ({
      data: mockPixelSettings,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })),
  };
});

vi.mock('@/lib/queries', () => ({
  usePixelSettingsMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  usePixelSettingsDeleteMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  usePixelSettingsQuery: usePixelSettingsQueryMock,
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

  it('calls usePixelSettingsQuery hook on render', () => {
    fastRender(<SettingsAdPixelsSection isPro />);

    expect(usePixelSettingsQueryMock).toHaveBeenCalled();
  });
});
