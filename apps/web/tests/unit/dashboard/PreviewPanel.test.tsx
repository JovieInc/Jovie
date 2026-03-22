import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewPanelData } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { PreviewPanel } from '@/features/dashboard/layout/PreviewPanel';

const closeMock = vi.fn();
let currentPreviewData: PreviewPanelData | null = null;

vi.mock('@jovie/ui', () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: { asChild?: boolean; children: ReactNode } & ComponentProps<'button'>) =>
    asChild && isValidElement(children) ? (
      cloneElement(children, props)
    ) : (
      <button type='button' {...props}>
        {children}
      </button>
    ),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({
    isOpen: true,
    close: closeMock,
  }),
  usePreviewPanelData: () => ({
    previewData: currentPreviewData,
  }),
}));

vi.mock('@/components/organisms/RightDrawer', () => ({
  RightDrawer: ({ children }: { children: ReactNode }) => (
    <div data-testid='right-drawer'>{children}</div>
  ),
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    ...props
  }: { children: ReactNode } & ComponentProps<'button'>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  DrawerEmptyState: ({ message }: { message: string }) => <div>{message}</div>,
  DrawerHeader: ({
    title,
    actions,
  }: {
    title: ReactNode;
    actions?: ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      {actions}
    </div>
  ),
}));

vi.mock('@/components/molecules/drawer-header/DrawerHeaderActions', () => ({
  DrawerHeaderActions: ({ onClose }: { onClose?: () => void }) => (
    <button onClick={onClose} type='button'>
      Close
    </button>
  ),
}));

vi.mock('@/features/dashboard/atoms/CopyLinkInput', () => ({
  CopyLinkInput: ({ url }: { url: string }) => (
    <input aria-label='Profile URL' readOnly value={url} />
  ),
}));

vi.mock('@/features/dashboard/molecules/ProfilePreview', () => ({
  ProfilePreview: ({
    username,
    displayName,
  }: {
    username: string;
    displayName: string;
  }) => <div>{`Preview ${displayName || username}`}</div>,
}));

vi.mock('@/lib/queries', () => ({
  useQrCodeDownloadMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

describe('PreviewPanel', () => {
  beforeEach(() => {
    currentPreviewData = null;
    closeMock.mockReset();
  });

  it('renders the hydration fallback while preview data is unavailable', () => {
    render(<PreviewPanel />);

    expect(screen.getByTestId('right-drawer')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This drawer will populate as soon as the profile preview state hydrates.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Loading profile preview…')).toBeInTheDocument();
  });

  it('renders profile snapshot details from hydrated preview data', () => {
    currentPreviewData = {
      username: 'timwhite',
      displayName: 'Tim White',
      avatarUrl: null,
      bio: 'Independent artist and producer.',
      genres: ['Pop', 'Electronic'],
      location: 'Los Angeles',
      hometown: 'Nashville',
      activeSinceYear: 2020,
      profilePath: '/timwhite',
      links: [
        {
          id: 'spotify',
          title: 'Spotify',
          url: 'https://spotify.com/timwhite',
          platform: 'spotify',
          isVisible: true,
        },
        {
          id: 'instagram',
          title: 'Instagram',
          url: 'https://instagram.com/timwhite',
          platform: 'instagram',
          isVisible: true,
        },
        {
          id: 'private-link',
          title: 'Private',
          url: 'https://example.com/private',
          platform: 'custom',
          isVisible: false,
        },
      ],
      dspConnections: {
        spotify: {
          connected: true,
          artistName: 'Tim White',
        },
        appleMusic: {
          connected: false,
          artistName: null,
        },
      },
    };

    render(<PreviewPanel />);

    expect(screen.getByText('1 draft')).toBeInTheDocument();
    expect(
      screen.getByText(
        /2 visible links currently anchor the public profile, with 1 draft still hidden from visitors\./
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Los Angeles')).toBeInTheDocument();
    expect(screen.getByText('From Nashville')).toBeInTheDocument();
    expect(screen.getByText('Since 2020')).toBeInTheDocument();
    expect(screen.getByText('Bio live')).toBeInTheDocument();
    expect(screen.getByText('1 connected')).toBeInTheDocument();
  });
});
