import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderKey } from '@/lib/discography/types';

import { createMockRelease } from '@/tests/test-utils/factories';

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
  };
});

vi.mock('@/components/atoms/ProviderIcon', () => ({
  ProviderIcon: ({ provider }: { provider: ProviderKey }) => (
    <span data-testid={`provider-icon-${provider}`} />
  ),
}));

vi.mock('@/components/molecules/drawer', () => ({
  DRAWER_SECTION_HEADING_CLASSNAME: 'drawer-heading',
  DrawerButton: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button type='button' {...props}>
      {children}
    </button>
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
      <h2>{title}</h2>
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
    icon,
    badge,
    onRemove,
  }: {
    label: string;
    icon: React.ReactNode;
    badge?: string;
    onRemove?: () => void;
  }) => (
    <div>
      {icon}
      <span>{label}</span>
      {badge ? <span>{badge}</span> : null}
      {onRemove ? (
        <button type='button' onClick={onRemove}>
          Remove {label}
        </button>
      ) : null}
    </div>
  ),
  DrawerSurfaceCard: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DrawerFormGridRow: ({
    children,
    label,
  }: {
    children: React.ReactNode;
    label: React.ReactNode;
  }) => (
    <div>
      <span>{label}</span>
      {children}
    </div>
  ),
}));

const { ReleaseDspLinks } = await import(
  '@/components/organisms/release-sidebar/ReleaseDspLinks'
);

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FA243C' },
  youtube: { label: 'YouTube Music', accent: '#FF0000' },
} as Record<ProviderKey, { label: string; accent: string }>;

describe('ReleaseDspLinks interactions', () => {
  const onSetIsAddingLink = vi.fn();
  const onSetNewLinkUrl = vi.fn();
  const onSetSelectedProvider = vi.fn();
  const onAddLink = vi.fn().mockResolvedValue(undefined);
  const onRemoveLink = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders existing DSP links with provider icons', () => {
    render(
      <ReleaseDspLinks
        release={createMockRelease({
          providers: [
            {
              key: 'spotify',
              url: 'https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P',
            },
            {
              key: 'apple_music',
              url: 'https://music.apple.com/us/song/blinding-lights/1499378108',
            },
          ],
        })}
        providerConfig={providerConfig}
        isEditable
        isAddingLink={false}
        newLinkUrl=''
        selectedProvider={null}
        isAddingDspLink={false}
        isRemovingDspLink={null}
        onSetIsAddingLink={onSetIsAddingLink}
        onSetNewLinkUrl={onSetNewLinkUrl}
        onSetSelectedProvider={onSetSelectedProvider}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
        onNewLinkKeyDown={vi.fn()}
      />
    );

    expect(screen.getByTestId('provider-icon-spotify')).toBeInTheDocument();
    expect(screen.getByTestId('provider-icon-apple_music')).toBeInTheDocument();
  });

  it('submits a valid link when the add form is already open', async () => {
    const user = userEvent.setup();

    render(
      <ReleaseDspLinks
        release={createMockRelease()}
        providerConfig={providerConfig}
        isEditable
        isAddingLink
        newLinkUrl='https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P'
        selectedProvider='spotify'
        isAddingDspLink={false}
        isRemovingDspLink={null}
        onSetIsAddingLink={onSetIsAddingLink}
        onSetNewLinkUrl={onSetNewLinkUrl}
        onSetSelectedProvider={onSetSelectedProvider}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
        onNewLinkKeyDown={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Add DSP link' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAddLink).toHaveBeenCalledTimes(1);
  });

  it('prevents empty or invalid URL submission', () => {
    render(
      <ReleaseDspLinks
        release={createMockRelease()}
        providerConfig={providerConfig}
        isEditable
        isAddingLink
        newLinkUrl='not-a-url'
        selectedProvider='spotify'
        isAddingDspLink={false}
        isRemovingDspLink={null}
        onSetIsAddingLink={onSetIsAddingLink}
        onSetNewLinkUrl={onSetNewLinkUrl}
        onSetSelectedProvider={onSetSelectedProvider}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
        onNewLinkKeyDown={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('removes an existing provider link', async () => {
    const user = userEvent.setup();

    render(
      <ReleaseDspLinks
        release={createMockRelease({
          providers: [
            {
              key: 'spotify',
              url: 'https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P',
            },
          ],
        })}
        providerConfig={providerConfig}
        isEditable
        isAddingLink={false}
        newLinkUrl=''
        selectedProvider={null}
        isAddingDspLink={false}
        isRemovingDspLink={null}
        onSetIsAddingLink={onSetIsAddingLink}
        onSetNewLinkUrl={onSetNewLinkUrl}
        onSetSelectedProvider={onSetSelectedProvider}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
        onNewLinkKeyDown={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove Spotify' }));
    expect(onRemoveLink).toHaveBeenCalledWith('spotify');
  });

  it('sorts providers by analytics popularity and marks outliers as Popular', () => {
    render(
      <ReleaseDspLinks
        release={createMockRelease({
          providers: [
            {
              key: 'apple_music',
              url: 'https://music.apple.com/us/song/deep-end/1',
            },
            {
              key: 'spotify',
              url: 'https://open.spotify.com/track/deep-end',
            },
            {
              key: 'youtube',
              url: 'https://music.youtube.com/watch?v=deep-end',
            },
          ],
        })}
        providerConfig={providerConfig}
        analytics={{
          totalClicks: 2841,
          last7DaysClicks: 186,
          providerClicks: [
            { provider: 'spotify', clicks: 1910 },
            { provider: 'apple_music', clicks: 581 },
            { provider: 'youtube', clicks: 350 },
          ],
        }}
        analyticsState='ready'
        isEditable
        isAddingLink={false}
        newLinkUrl=''
        selectedProvider={null}
        isAddingDspLink={false}
        isRemovingDspLink={null}
        onSetIsAddingLink={onSetIsAddingLink}
        onSetNewLinkUrl={onSetNewLinkUrl}
        onSetSelectedProvider={onSetSelectedProvider}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
        onNewLinkKeyDown={vi.fn()}
      />
    );

    const labels = screen
      .getAllByText(/^Spotify$|^Apple Music$|^YouTube Music$/)
      .map(node => node.textContent);

    expect(labels).toEqual(['Spotify', 'Apple Music', 'YouTube Music']);
    expect(screen.getByText('Popular')).toBeInTheDocument();
  });
});
