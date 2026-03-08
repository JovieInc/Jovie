import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderKey } from '@/lib/discography/types';

import { createMockRelease } from '@/tests/test-utils/factories';

// @jovie/ui: ReleaseSidebar uses SegmentControl; ReleaseDspLinks (real) uses
// Button, Input, Label, Select*, SimpleTooltip.
vi.mock('@jovie/ui', async () => {
  const React = await import('react');
  const SelectContext = React.createContext<
    ((value: string) => void) | undefined
  >(undefined);

  return {
    Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
      <button type='button' {...props}>
        {children}
      </button>
    ),
    Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
    Label: ({ children, ...props }: React.ComponentProps<'label'>) => (
      <span {...props}>{children}</span>
    ),
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) => (
      <SelectContext.Provider value={onValueChange}>
        {children}
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span>{placeholder}</span>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => {
      const onSelect = React.useContext(SelectContext);
      return (
        <button type='button' onClick={() => onSelect?.(value)}>
          {children}
        </button>
      );
    },
    SimpleTooltip: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    SegmentControl: ({
      value,
      onValueChange,
      options,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      options: Array<{
        value: string;
        label: string;
      }>;
    }) => (
      <div>
        {options.map(option => (
          <button
            key={option.value}
            type='button'
            aria-selected={value === option.value}
            role='tab'
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    ),
    // ContextMenu components (imported transitively by AlbumArtworkContextMenu)
    ContextMenu: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
    ContextMenuContent: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
    ContextMenuItem: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
    ContextMenuLabel: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
    ContextMenuSeparator: () => <hr />,
    ContextMenuTrigger: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

// Mock drawer molecules — EntitySidebarShell renders children with empty state support.
vi.mock('@/components/molecules/drawer', () => ({
  EntitySidebarShell: ({
    children,
    isEmpty,
    emptyMessage,
    entityHeader,
    tabs,
  }: {
    children?: React.ReactNode;
    isEmpty?: boolean;
    emptyMessage?: string;
    entityHeader?: React.ReactNode;
    tabs?: React.ReactNode;
    [key: string]: unknown;
  }) =>
    isEmpty ? (
      <p>{emptyMessage}</p>
    ) : (
      <div>
        {entityHeader}
        {tabs}
        {children}
      </div>
    ),
  EntityHeaderCard: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerEmptyState: ({ message }: { message: string }) => <p>{message}</p>,
  DrawerSection: ({ children }: { children?: React.ReactNode }) => (
    <section>{children}</section>
  ),
  DrawerLinkSection: ({
    title,
    children,
    onAdd,
    addLabel,
  }: {
    title: string;
    children: React.ReactNode;
    onAdd?: () => void;
    addLabel?: string;
  }) => (
    <section>
      <h3>{title}</h3>
      {onAdd ? (
        <button type='button' onClick={onAdd}>
          {addLabel}
        </button>
      ) : null}
      {children}
    </section>
  ),
  SidebarLinkRow: ({
    label,
    onRemove,
  }: {
    label: string;
    onRemove?: () => void;
  }) => (
    <div>
      <span>{label}</span>
      {onRemove ? (
        <button type='button' onClick={onRemove}>
          Remove {label}
        </button>
      ) : null}
    </div>
  ),
  DrawerAsyncToggle: ({ label }: { label: string }) => (
    <div data-testid='async-toggle'>{label}</div>
  ),
}));

vi.mock('@/components/dashboard/atoms/DspProviderIcon', () => ({
  DspProviderIcon: () => <span data-testid='provider-icon' />,
}));

vi.mock('@/components/organisms/release-sidebar/ReleaseSidebarHeader', () => ({
  useReleaseHeaderParts: () => ({ title: 'Header', actions: null }),
}));
vi.mock('next/image', () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));
vi.mock('@/components/atoms/Icon', () => ({
  Icon: () => <span />,
}));
vi.mock('@/components/release/AlbumArtworkContextMenu', () => ({
  AlbumArtworkContextMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  buildArtworkSizes: () => ({}),
}));
vi.mock('@/components/organisms/AvatarUploadable', () => ({
  AvatarUploadable: () => <div>Artwork</div>,
}));
vi.mock('@/components/organisms/release-sidebar/ReleaseFields', () => ({
  ReleaseFields: () => <div>Fields</div>,
}));
vi.mock('@/components/organisms/release-sidebar/ReleaseTrackList', () => ({
  ReleaseTrackList: () => <div>Tracks</div>,
}));
vi.mock('@/components/organisms/release-sidebar/ReleaseMetadata', () => ({
  ReleaseMetadata: () => <div>Metadata</div>,
}));
vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  updateAllowArtworkDownloads: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/components/organisms/release-sidebar/ReleaseLyricsSection', () => ({
  ReleaseLyricsSection: () => <div>Lyrics</div>,
}));
vi.mock('@/components/organisms/release-sidebar/TrackDetailPanel', () => ({
  TrackDetailPanel: () => <div>Track Detail</div>,
}));
vi.mock(
  '@/components/organisms/release-sidebar/ReleaseSmartLinkSection',
  () => ({
    ReleaseSmartLinkSection: () => <div>Smart link</div>,
  })
);
vi.mock(
  '@/components/organisms/release-sidebar/ReleaseSmartLinkAnalytics',
  () => ({
    ReleaseSmartLinkAnalytics: () => <div>Analytics</div>,
  })
);

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));
vi.mock('@/lib/utm', () => ({
  buildUTMContext: () => ({}),
  getUTMShareDropdownItems: () => [],
}));

const { ReleaseSidebar } = await import(
  '@/components/organisms/release-sidebar/ReleaseSidebar'
);

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FA243C' },
  youtube: { label: 'YouTube Music', accent: '#FF0000' },
} as Record<ProviderKey, { label: string; accent: string }>;

describe('ReleaseSidebar links tab interactions', () => {
  const onAddDspLink = vi.fn().mockResolvedValue(undefined);
  const onRemoveDspLink = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a DSP link with expected payload shape', async () => {
    const user = userEvent.setup();
    const release = createMockRelease({
      providers: [
        {
          key: 'spotify',
          url: 'https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P',
        },
      ],
    });

    render(
      <ReleaseSidebar
        release={release}
        mode='admin'
        isOpen
        providerConfig={providerConfig}
        onAddDspLink={onAddDspLink}
        onRemoveDspLink={onRemoveDspLink}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Platforms' }));
    await user.click(screen.getByRole('button', { name: 'Add platform link' }));
    await user.click(screen.getByRole('button', { name: 'Apple Music' }));

    const urlInput = screen.getByPlaceholderText(
      'https://open.spotify.com/...'
    );
    await user.type(
      urlInput,
      'https://music.apple.com/us/song/blinding-lights/1499378108'
    );

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddDspLink).toHaveBeenCalledWith(
      release.id,
      'apple_music',
      'https://music.apple.com/us/song/blinding-lights/1499378108'
    );
  });

  it('disables add action for invalid URL input', async () => {
    const user = userEvent.setup();

    render(
      <ReleaseSidebar
        release={createMockRelease()}
        mode='admin'
        isOpen
        providerConfig={providerConfig}
        onAddDspLink={onAddDspLink}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Platforms' }));
    await user.click(screen.getByRole('button', { name: 'Add platform link' }));
    await user.click(screen.getByRole('button', { name: 'Spotify' }));
    await user.type(
      screen.getByPlaceholderText('https://open.spotify.com/...'),
      'not-a-url'
    );

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(onAddDspLink).not.toHaveBeenCalled();
  });

  it('removes an existing DSP link from the links tab', async () => {
    const user = userEvent.setup();
    const release = createMockRelease({
      providers: [
        {
          key: 'spotify',
          url: 'https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P',
        },
      ],
    });

    render(
      <ReleaseSidebar
        release={release}
        mode='admin'
        isOpen
        providerConfig={providerConfig}
        onRemoveDspLink={onRemoveDspLink}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Platforms' }));
    await user.click(screen.getByRole('button', { name: 'Remove Spotify' }));

    expect(onRemoveDspLink).toHaveBeenCalledWith(release.id, 'spotify');
  });
});
