import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsAdPixelsSection } from '@/components/dashboard/organisms/SettingsAdPixelsSection';
import { renderWithQueryClient } from '../../utils/test-utils';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const pixelSettingsResponse = {
  pixels: {
    facebookPixelId: '123456789',
    googleMeasurementId: 'G-XXXXXX',
    tiktokPixelId: 'C111111',
    enabled: true,
    facebookEnabled: true,
    googleEnabled: true,
    tiktokEnabled: true,
  },
  hasTokens: {
    facebook: true,
    google: true,
    tiktok: true,
  },
};

const emptyPixelSettingsResponse = {
  pixels: {
    facebookPixelId: null,
    googleMeasurementId: null,
    tiktokPixelId: null,
    enabled: true,
    facebookEnabled: true,
    googleEnabled: true,
    tiktokEnabled: true,
  },
  hasTokens: {
    facebook: false,
    google: false,
    tiktok: false,
  },
};

describe('SettingsAdPixelsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all three platform sections', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(emptyPixelSettingsResponse),
    });

    renderWithQueryClient(<SettingsAdPixelsSection />);

    expect(screen.getByText('Facebook Conversions API')).toBeInTheDocument();
    expect(
      screen.getByText('Google Analytics 4 (Measurement Protocol)')
    ).toBeInTheDocument();
    expect(screen.getByText('TikTok Events API')).toBeInTheDocument();
  });

  it('renders the save button', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(emptyPixelSettingsResponse),
    });

    renderWithQueryClient(<SettingsAdPixelsSection />);

    expect(
      screen.getByRole('button', { name: /save pixel settings/i })
    ).toBeInTheDocument();
  });

  it('does not show clear buttons when no config exists', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(emptyPixelSettingsResponse),
    });

    renderWithQueryClient(<SettingsAdPixelsSection />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboard/pixels',
        expect.any(Object)
      );
    });

    expect(
      screen.queryByRole('button', {
        name: /clear facebook/i,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /clear google/i,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /clear tiktok/i,
      })
    ).not.toBeInTheDocument();
  });

  it('shows clear buttons when platforms have config', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(pixelSettingsResponse),
    });

    renderWithQueryClient(<SettingsAdPixelsSection />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: /clear facebook conversions api credentials/i,
        })
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', {
        name: /clear google analytics 4/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /clear tiktok events api credentials/i,
      })
    ).toBeInTheDocument();
  });

  it('calls DELETE endpoint when clear button is clicked', async () => {
    // First call: GET settings
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(pixelSettingsResponse),
    });

    renderWithQueryClient(<SettingsAdPixelsSection />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: /clear facebook conversions api credentials/i,
        })
      ).toBeInTheDocument();
    });

    // Mock the DELETE response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /clear facebook conversions api credentials/i,
      })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboard/pixels?platform=facebook',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  it('calls DELETE with google platform', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(pixelSettingsResponse),
    });

    renderWithQueryClient(<SettingsAdPixelsSection />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: /clear google analytics 4/i,
        })
      ).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /clear google analytics 4/i,
      })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboard/pixels?platform=google',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  it('calls DELETE with tiktok platform', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(pixelSettingsResponse),
    });

    renderWithQueryClient(<SettingsAdPixelsSection />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: /clear tiktok events api credentials/i,
        })
      ).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /clear tiktok events api credentials/i,
      })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboard/pixels?platform=tiktok',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  it('populates form fields from fetched settings', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(pixelSettingsResponse),
    });

    renderWithQueryClient(<SettingsAdPixelsSection />);

    await waitFor(() => {
      const fbInput = screen.getByLabelText('Pixel ID') as HTMLInputElement;
      expect(fbInput.value).toBe('123456789');
    });

    const googleInput = screen.getByLabelText(
      'Measurement ID'
    ) as HTMLInputElement;
    expect(googleInput.value).toBe('G-XXXXXX');

    const tiktokInput = screen.getByLabelText('Pixel Code') as HTMLInputElement;
    expect(tiktokInput.value).toBe('C111111');
  });

  it('renders enabled/disabled toggle', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(emptyPixelSettingsResponse),
    });

    renderWithQueryClient(<SettingsAdPixelsSection />);

    expect(
      screen.getByRole('switch', { name: /enable pixel tracking/i })
    ).toBeInTheDocument();
  });
});
