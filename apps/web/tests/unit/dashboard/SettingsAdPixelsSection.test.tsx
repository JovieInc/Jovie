import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const { usePixelSettingsQueryMock, pixelQueryState, refetch, savePixels } =
  vi.hoisted(() => {
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
      pixelQueryState: {
        data: mockPixelSettings,
        isLoading: false,
        isError: false,
      },
      refetch: vi.fn(),
      savePixels: vi.fn(),
      usePixelSettingsQueryMock: vi.fn(),
    };
  });

usePixelSettingsQueryMock.mockImplementation(() => ({
  ...pixelQueryState,
  refetch,
}));

const { SettingsToggleRowMock } = vi.hoisted(() => ({
  SettingsToggleRowMock: ({
    title,
    checked,
    onCheckedChange,
  }: {
    title: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      type='button'
      data-testid='shared-settings-toggle'
      aria-label={title}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {title}
    </button>
  ),
}));

vi.mock('@/features/dashboard/molecules/SettingsToggleRow', () => ({
  SettingsToggleRow: SettingsToggleRowMock,
}));

vi.mock('@/lib/queries', () => ({
  usePixelSettingsMutation: () => ({
    mutateAsync: savePixels,
    isPending: false,
  }),
  usePixelSettingsDeleteMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  usePixelSettingsQuery: usePixelSettingsQueryMock,
  usePixelHealthQuery: () => ({
    data: null,
    isLoading: false,
    isError: false,
  }),
}));

describe('SettingsAdPixelsSection', () => {
  beforeEach(() => {
    pixelQueryState.data = {
      pixels: {
        facebookPixelId: '1234567890123456',
        googleMeasurementId: 'G-ABCD1234EF',
        tiktokPixelId: null,
        enabled: true,
        facebookEnabled: true,
        googleEnabled: true,
        tiktokEnabled: false,
      },
      hasTokens: { facebook: true, google: true, tiktok: false },
    };
    pixelQueryState.isLoading = false;
    pixelQueryState.isError = false;
    refetch.mockReset();
    savePixels.mockReset();
    savePixels.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders each retargeting platform as a separate setting card with status', () => {
    const { getByRole, getAllByRole, getByText, getAllByText } = fastRender(
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

    const facebookHeading = getByRole('heading', {
      name: 'Facebook Conversions API',
    });
    expect(facebookHeading.parentElement?.parentElement).toHaveClass(
      'flex-col',
      'sm:flex-row'
    );
    const facebookActions = getAllByRole('button', { name: 'Test' })[0]
      ?.parentElement?.parentElement;
    expect(facebookActions).toHaveClass(
      'w-full',
      'flex-wrap',
      'sm:w-auto',
      'sm:justify-end'
    );
    expect(facebookActions).toHaveTextContent('Configured');
  });

  it('calls usePixelSettingsQuery hook on render', () => {
    fastRender(<SettingsAdPixelsSection isPro />);

    expect(usePixelSettingsQueryMock).toHaveBeenCalled();
  });

  it('uses the shared settings toggle row for the pixel enable control', () => {
    const { getByTestId } = fastRender(<SettingsAdPixelsSection isPro />);

    expect(getByTestId('shared-settings-toggle')).toHaveTextContent(
      'Enable pixel tracking'
    );
  });

  it('saves edited pixels without resending token placeholders, then resets from refreshed data', async () => {
    let resolveSave!: () => void;
    savePixels.mockReturnValue(
      new Promise<void>(resolve => {
        resolveSave = resolve;
      })
    );
    const view = fastRender(<SettingsAdPixelsSection isPro />);

    fireEvent.change(view.getByLabelText('Pixel ID'), {
      target: { value: '9999999999999999' },
    });
    fireEvent.click(
      view.getByRole('button', { name: 'Enable pixel tracking' })
    );
    fireEvent.click(view.getByRole('button', { name: 'Save Pixel Settings' }));

    expect(savePixels).toHaveBeenCalledWith({
      facebookPixelId: '9999999999999999',
      facebookAccessToken: '',
      googleMeasurementId: 'G-ABCD1234EF',
      googleApiSecret: '',
      tiktokPixelId: '',
      tiktokAccessToken: '',
      enabled: false,
    });
    expect(view.getByText('Saving…')).toHaveAttribute('data-state', 'saving');

    resolveSave();
    await waitFor(() => {
      expect(view.getByText('Saved')).toHaveAttribute('data-state', 'saved');
    });

    pixelQueryState.data = {
      ...pixelQueryState.data,
      pixels: {
        ...pixelQueryState.data.pixels,
        facebookPixelId: '9999999999999999',
        enabled: false,
      },
    };
    view.rerender(<SettingsAdPixelsSection isPro />);

    await waitFor(() => {
      expect(
        view.getByRole('button', { name: 'Save Pixel Settings' })
      ).toBeDisabled();
    });
  });

  it('keeps edited pixel state retryable after save rejection', async () => {
    savePixels.mockRejectedValueOnce(new Error('network down'));
    const view = fastRender(<SettingsAdPixelsSection isPro />);

    fireEvent.change(view.getByLabelText('Measurement ID'), {
      target: { value: 'G-RETRY1234' },
    });
    fireEvent.click(view.getByRole('button', { name: 'Save Pixel Settings' }));

    await waitFor(() => {
      expect(view.getByText('Failed to save. Try again.')).toHaveAttribute(
        'data-state',
        'error'
      );
    });
    expect(savePixels).toHaveBeenCalledWith(
      expect.objectContaining({
        googleMeasurementId: 'G-RETRY1234',
        googleApiSecret: '',
      })
    );
    expect(
      view.getByRole('button', { name: 'Save Pixel Settings' })
    ).toBeEnabled();
  });

  it('keeps the pixel loading state in the same settings panel anatomy', () => {
    pixelQueryState.isLoading = true;
    const { getByRole } = fastRender(<SettingsAdPixelsSection isPro />);

    const panelRoot = getByRole('heading', {
      name: 'Pixel tracking',
    }).closest('.space-y-2');
    expect(panelRoot).not.toBeNull();

    const bodyWrapper = panelRoot?.querySelector(
      ':scope > [data-testid="card"] > div > .px-4.py-4'
    );
    expect(bodyWrapper).toHaveClass('px-4', 'py-4', 'sm:px-5');
  });

  it('keeps pixel load failures recoverable', () => {
    pixelQueryState.isError = true;
    const { getByRole, getByText } = fastRender(
      <SettingsAdPixelsSection isPro />
    );

    expect(getByText('Failed to load pixel settings.')).toBeDefined();
    getByRole('button', { name: 'Try Again' }).click();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('announces successful test events as a live status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true }),
      })
    );
    const { findByRole, getAllByRole } = fastRender(
      <SettingsAdPixelsSection isPro />
    );

    getAllByRole('button', { name: 'Test' })[0]?.click();

    expect(await findByRole('status')).toHaveTextContent('Event received');
  });

  it('announces failed test events as alerts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: false,
          error: 'Pixel credentials rejected',
        }),
      })
    );
    const { findByRole, getAllByRole } = fastRender(
      <SettingsAdPixelsSection isPro />
    );

    getAllByRole('button', { name: 'Test' })[0]?.click();

    expect(await findByRole('alert')).toHaveTextContent(
      'Pixel credentials rejected'
    );
  });
});
