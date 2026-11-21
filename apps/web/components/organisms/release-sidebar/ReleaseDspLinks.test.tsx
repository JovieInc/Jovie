import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderKey } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import type { Release } from './types';

const release = {
  profileId: 'profile-1',
  id: 'rel_1',
  title: 'Midnight Drive',
  status: 'released',
  slug: 'midnight-drive',
  smartLinkPath: '/example/midnight-drive',
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify',
      url: 'https://open.spotify.com/album/x',
      label: 'Spotify',
      path: '',
      isPrimary: true,
      source: 'ingested',
      updatedAt: '2026-09-12T00:00:00Z',
    },
  ],
  providerCounts: {
    canonical: 1,
    searchFallback: 0,
    unknown: 1,
    unresolvedProviders: ['apple_music'],
  },
} satisfies Release;

const providerConfig = {
  spotify: { label: 'Spotify', accent: 'text-primary-token' },
  apple_music: { label: 'Apple Music', accent: 'text-primary-token' },
} as Record<ProviderKey, { label: string; accent: string }>;

type Props = ComponentProps<typeof ReleaseDspLinks>;

function Harness(overrides: Partial<Props>) {
  const [url, setUrl] = useState('');
  return (
    <ReleaseDspLinks
      release={release}
      providerConfig={providerConfig}
      isEditable
      isAddingLink
      newLinkUrl={url}
      selectedProvider={null}
      isAddingDspLink={false}
      isRemovingDspLink={null}
      onSetIsAddingLink={vi.fn()}
      onSetNewLinkUrl={setUrl}
      onSetSelectedProvider={vi.fn()}
      onAddLink={vi.fn().mockResolvedValue(undefined)}
      onRemoveLink={vi.fn().mockResolvedValue(undefined)}
      onNewLinkKeyDown={vi.fn()}
      {...overrides}
    />
  );
}

describe('ReleaseDspLinks', () => {
  it('focuses the URL field when adding and keeps typed text through a rerender and blur', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Harness />);

    const url = screen.getByPlaceholderText('https://open.spotify.com/...');
    expect(url).toHaveFocus();
    await user.type(url, 'https://example.com/a');
    rerender(<Harness />);
    expect(url).toHaveValue('https://example.com/a');
    expect(url).toHaveFocus();
    await user.tab();
    expect(url).toHaveValue('https://example.com/a');
    await expectNoA11yViolations(container);
  });

  it('starts a find from an unresolved provider and cancels the draft', async () => {
    const user = userEvent.setup();
    const onSetSelectedProvider = vi.fn();
    const onSetIsAddingLink = vi.fn();
    const { container } = render(
      <Harness
        isAddingLink={false}
        onSetSelectedProvider={onSetSelectedProvider}
        onSetIsAddingLink={onSetIsAddingLink}
      />
    );

    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(onSetSelectedProvider).toHaveBeenCalledWith('apple_music');
    expect(onSetIsAddingLink).toHaveBeenCalledWith(true);
  });

  it('cancels an open draft and disables Add without a valid URL', async () => {
    const user = userEvent.setup();
    const onSetIsAddingLink = vi.fn();
    render(<Harness onSetIsAddingLink={onSetIsAddingLink} />);

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSetIsAddingLink).toHaveBeenCalledWith(false);
  });

  it('shows the empty message with no providers and has no axe violations', async () => {
    const { container } = render(
      <Harness
        isAddingLink={false}
        release={{
          ...release,
          providers: [],
          providerCounts: undefined,
        }}
      />
    );

    expect(screen.getByText('No DSP links yet.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
