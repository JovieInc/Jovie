import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseEditDialog } from './ReleaseEditDialog';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  status: 'released',
  slug: 'skyline-dreams',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-06-15',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify',
      url: 'https://open.spotify.com/album/1',
      source: 'manual',
      updatedAt: '2026-01-01T00:00:00.000Z',
      label: 'Spotify',
      path: '/spotify',
      isPrimary: true,
    },
  ],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: null,
  primaryIsrc: null,
  upc: null,
};

const providerList = [
  {
    key: 'spotify' as ProviderKey,
    label: 'Spotify',
    accent: '#1DB954',
    isPrimary: true,
  },
];

function Harness({
  onSave = vi.fn(),
  onReset = vi.fn(),
  onClose = vi.fn(),
  tick = 0,
}: {
  readonly tick?: number;
  readonly onSave?: (provider: ProviderKey) => void;
  readonly onReset?: (provider: ProviderKey) => void;
  readonly onClose?: () => void;
}) {
  const [drafts, setDrafts] = useState<Partial<Record<ProviderKey, string>>>({
    spotify: 'https://open.spotify.com/album/1',
  });
  return (
    <div data-tick={tick}>
      <ReleaseEditDialog
        release={release}
        providerList={providerList}
        drafts={drafts}
        isSaving={false}
        onDraftChange={(provider, value) =>
          setDrafts(prev => ({ ...prev, [provider]: value }))
        }
        onSave={onSave}
        onReset={onReset}
        onClose={onClose}
      />
    </div>
  );
}

describe('ReleaseEditDialog certificate', () => {
  it('keeps typed input and focus across a parent rerender and Escape', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    const input = screen.getByTestId('provider-input-release-1-spotify');
    await user.clear(input);
    await user.type(input, 'https://example.com/x');
    rerender(<Harness tick={1} />);
    const after = screen.getByTestId('provider-input-release-1-spotify');
    expect(after).toHaveValue('https://example.com/x');
    await user.click(after);
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('provider-input-release-1-spotify')).toHaveValue(
      'https://example.com/x'
    );
  });

  it('fires save, reset and done and has no nested border on the header chips', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onReset = vi.fn();
    const onClose = vi.fn();
    const { baseElement } = render(
      <Harness onSave={onSave} onReset={onReset} onClose={onClose} />
    );
    await user.click(screen.getByTestId('save-provider-release-1-spotify'));
    await user.click(screen.getByTestId('reset-provider-release-1-spotify'));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onSave).toHaveBeenCalledWith('spotify');
    expect(onReset).toHaveBeenCalledWith('spotify');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Jun 15, 2026')).not.toHaveClass('border-subtle');
    await expectNoA11yViolations(baseElement);
  });

  it('renders the empty provider list axe-clean', async () => {
    const { baseElement } = render(
      <ReleaseEditDialog
        release={release}
        providerList={[]}
        drafts={{}}
        isSaving={false}
        onDraftChange={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Edit Release Links')).toBeInTheDocument();
    await expectNoA11yViolations(baseElement);
  });
});
