import { describe, expect, it, vi } from 'vitest';
import { SettingsAdPixelsSection } from '@/components/dashboard/organisms/SettingsAdPixelsSection';
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
  Button: ({ children, ...props }: { children: React.ReactNode }) => (
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

// Quarantined in tests/quarantine.json: component's deep import tree causes OOM in vitest forks.
// TODO: Re-enable after extracting heavy deps or increasing Node heap limit in CI.
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
