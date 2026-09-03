import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/feedback/FeedbackProvider';
import { TOAST_DURATIONS } from '@/components/feedback/toast';

interface ToasterPropsSnapshot {
  readonly theme?: string;
  readonly position?: string;
  readonly expand?: boolean;
  readonly closeButton?: boolean;
  readonly richColors?: boolean;
  readonly gap?: number;
  readonly offset?: string;
  readonly visibleToasts?: number;
  readonly toastOptions: {
    readonly duration?: number;
    readonly classNames: Record<string, string>;
  };
}

const {
  mockPathname,
  mockResolvedTheme,
  mockSonnerToast,
  mockToaster,
  mockToastOffset,
} = vi.hoisted(() => ({
  mockPathname: vi.fn(() => '/app/chat'),
  mockResolvedTheme: vi.fn(() => 'dark'),
  mockSonnerToast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
  }),
  mockToaster: vi.fn((_props: unknown) => null),
  mockToastOffset: vi.fn(() => 24),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme() }),
}));

vi.mock('@/lib/hooks/useCookieBannerHeight', () => ({
  useCookieBannerHeight: () => mockToastOffset(),
}));

vi.mock('sonner', () => ({
  Toaster: mockToaster,
  toast: mockSonnerToast,
}));

beforeEach(() => {
  mockPathname.mockReturnValue('/app/chat');
  mockResolvedTheme.mockReturnValue('dark');
  mockToastOffset.mockReturnValue(24);
});

afterEach(() => {
  vi.clearAllMocks();
});

function getLastToasterProps(): ToasterPropsSnapshot {
  const props = mockToaster.mock.lastCall?.[0] as
    | ToasterPropsSnapshot
    | undefined;
  expect(props).toBeDefined();
  return props as ToasterPropsSnapshot;
}

describe('FeedbackProvider toast viewport', () => {
  it('mounts the canonical stacked toast viewport after hydration', async () => {
    render(
      <FeedbackProvider>
        <main>Workspace</main>
      </FeedbackProvider>
    );

    await waitFor(() => {
      expect(mockToaster).toHaveBeenCalled();
    });

    const props = getLastToasterProps();
    expect(props).toMatchObject({
      theme: 'dark',
      position: 'bottom-right',
      expand: true,
      closeButton: true,
      richColors: false,
      gap: 8,
      offset: 'calc(24px + env(safe-area-inset-bottom, 0px))',
      visibleToasts: 3,
    });
    expect(props.toastOptions.duration).toBe(TOAST_DURATIONS.DEFAULT);
  });

  it('keeps action affordances keyboard-focusable and token-owned', async () => {
    render(
      <FeedbackProvider>
        <main>Workspace</main>
      </FeedbackProvider>
    );

    await waitFor(() => {
      expect(mockToaster).toHaveBeenCalled();
    });

    const classNames = getLastToasterProps().toastOptions.classNames;
    expect(classNames.actionButton).toContain('border border-default');
    expect(classNames.actionButton).toContain('focus-visible:ring-accent');
    expect(classNames.cancelButton).toContain('bg-surface-2');
    expect(classNames.cancelButton).toContain('focus-visible:ring-accent');
  });

  it('does not mount app feedback chrome on public profile routes', () => {
    mockPathname.mockReturnValue('/tim');

    render(
      <FeedbackProvider>
        <main>Public Profile</main>
      </FeedbackProvider>
    );

    expect(mockToaster).not.toHaveBeenCalled();
  });
});
