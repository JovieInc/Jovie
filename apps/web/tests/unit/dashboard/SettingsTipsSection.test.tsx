import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsTipsSection } from '@/features/dashboard/organisms/SettingsTipsSection';
import { fastRender } from '@/tests/utils/fast-render';

const {
  mockReplace,
  mockPush,
  mockOpen,
  mockRefetch,
  mockUseProfileMonetizationSummary,
} = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
  mockOpen: vi.fn(),
  mockRefetch: vi.fn(),
  mockUseProfileMonetizationSummary: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/settings/artist-profile',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => new URLSearchParams('tab=earn'),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({
    open: mockOpen,
  }),
}));

vi.mock('@/lib/queries', () => ({
  useProfileMonetizationSummary: () => mockUseProfileMonetizationSummary(),
}));

vi.mock('@/components/molecules/settings/SettingsPanel', () => ({
  SettingsPanel: ({
    title,
    description,
    children,
  }: {
    title: string;
    description: string;
    children: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  ),
}));

vi.mock('@/features/dashboard/molecules/ProfileTipsSurface', () => ({
  ProfileTipsSurface: ({ summary }: { summary: { narrative: string } }) => (
    <div data-testid='profile-tips-surface'>{summary.narrative}</div>
  ),
}));

describe('SettingsTipsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefetch.mockResolvedValue(undefined);
  });

  it('renders the monetization surface when the summary loads', () => {
    mockUseProfileMonetizationSummary.mockReturnValue({
      data: {
        narrative: 'Tips are live.',
      },
      isError: false,
      isLoading: false,
      refetch: mockRefetch,
    });

    const { getByRole, getByTestId } = fastRender(<SettingsTipsSection />);

    expect(getByRole('heading', { name: 'Tips' })).toBeDefined();
    expect(getByTestId('profile-tips-surface')).toHaveTextContent(
      'Tips are live.'
    );
  });

  it('shows a retry state when the summary query fails', () => {
    mockUseProfileMonetizationSummary.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch: mockRefetch,
    });

    const { getByRole, getByText } = fastRender(<SettingsTipsSection />);

    expect(
      getByText('Could not load your tips summary right now.')
    ).toBeDefined();

    fireEvent.click(getByRole('button', { name: 'Try Again' }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
