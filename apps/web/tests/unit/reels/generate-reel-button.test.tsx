import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerateReel = vi.fn();
const mockUseAppFlag = vi.fn<(name: string) => boolean>(() => true);

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: (name: string) => mockUseAppFlag(name),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/reel-actions', () => ({
  generateReel: (...args: unknown[]) => mockGenerateReel(...args),
  getReelJob: vi.fn().mockResolvedValue(null),
  listReelJobsForRelease: vi.fn().mockResolvedValue([]),
}));

const { GenerateReelButton } = await import(
  '@/components/features/dashboard/release-tasks/GenerateReelButton'
);

function withQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe('GenerateReelButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppFlag.mockImplementation(() => true);
  });

  it('renders nothing when VIRAL_REEL_MVP is off', () => {
    mockUseAppFlag.mockImplementation(() => false);
    const { container } = render(
      withQuery(<GenerateReelButton releaseId='rel-1' />)
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the button when flag is on', () => {
    render(withQuery(<GenerateReelButton releaseId='rel-1' />));
    expect(screen.getByTestId('generate-reel-button')).toBeInTheDocument();
    expect(screen.getByTestId('generate-reel-button').textContent).toMatch(
      /Generate reel/i
    );
  });

  it('calls generateReel on click and enters a pending state', async () => {
    mockGenerateReel.mockResolvedValue({
      ok: true,
      jobId: 'job-1',
      status: 'queued',
    });
    render(withQuery(<GenerateReelButton releaseId='rel-1' />));
    fireEvent.click(screen.getByTestId('generate-reel-button'));
    await waitFor(() => {
      expect(mockGenerateReel).toHaveBeenCalledWith('rel-1');
    });
  });

  it('shows an info toast and tracks the existing job when recent_job_exists', async () => {
    mockGenerateReel.mockResolvedValue({
      ok: false,
      reason: 'recent_job_exists',
      jobId: 'existing-job',
    });
    const { toast } = await import('sonner');
    render(withQuery(<GenerateReelButton releaseId='rel-1' />));
    fireEvent.click(screen.getByTestId('generate-reel-button'));
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalled();
    });
  });

  it('shows an error toast when generate fails', async () => {
    mockGenerateReel.mockResolvedValue({ ok: false, reason: 'flag_off' });
    const { toast } = await import('sonner');
    render(withQuery(<GenerateReelButton releaseId='rel-1' />));
    fireEvent.click(screen.getByTestId('generate-reel-button'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
