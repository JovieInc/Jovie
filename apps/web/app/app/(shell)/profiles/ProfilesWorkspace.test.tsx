import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { classifyConnectionInput } from './AddConnectionRail';
import type { ProfilesWorkspaceData } from './data';
import { ProfilesWorkspace } from './ProfilesWorkspace';

describe('classifyConnectionInput', () => {
  it('normalizes and classifies a bare provider domain', () => {
    const result = classifyConnectionInput('Instagram.com/timwhite', [], 'Tim');

    expect(result.error).toBeNull();
    expect(result.candidate).toMatchObject({
      platformId: 'instagram',
      platformName: 'Instagram',
      url: 'https://instagram.com/timwhite',
    });
  });

  it('offers ranked handle-capable platforms for an at-handle', () => {
    const result = classifyConnectionInput('@timwhite', [], 'Tim');

    expect(result.candidate).toBeNull();
    expect(result.suggestions.slice(0, 4).map(item => item.platformId)).toEqual(
      ['instagram', 'tiktok', 'youtube', 'twitter']
    );
    expect(result.suggestions[0]).toMatchObject({
      handle: '@timwhite',
      url: 'https://instagram.com/timwhite',
    });
  });

  it('fuzzy filters a platform-qualified username', () => {
    const result = classifyConnectionInput('insta timwhite', [], 'Tim');

    expect(result.suggestions[0]).toMatchObject({
      platformId: 'instagram',
      handle: '@timwhite',
    });
  });

  it('does not suggest a platform that already exists', () => {
    const result = classifyConnectionInput('@timwhite', ['instagram'], 'Tim');

    expect(result.suggestions.map(item => item.platformId)).not.toContain(
      'instagram'
    );
  });

  it('rejects credential-bearing URLs', () => {
    const credentialBearingUrl = [
      'https://user',
      'pass@instagram.com/timwhite',
    ].join(':');
    const result = classifyConnectionInput(credentialBearingUrl, [], 'Tim');

    expect(result.candidate).toBeNull();
    expect(result.error).toMatch(/without credentials/i);
  });
});

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

const data: ProfilesWorkspaceData = {
  artist: {
    name: 'Tim White',
    username: 'tim',
    avatarUrl: null,
  },
  rows: [
    {
      id: 'jovie',
      rowType: 'surface',
      kind: 'jovie',
      platform: 'jovie',
      label: 'Jovie Profile',
      handle: '@tim',
      url: 'https://jov.ie/tim',
      trackedUrl: null,
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'active',
      rank: 2,
      previousRank: 4,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
    },
    {
      id: 'spotify',
      rowType: 'surface',
      kind: 'dsp',
      platform: 'spotify',
      label: 'Spotify',
      handle: null,
      url: 'https://open.spotify.com/artist/tim',
      trackedUrl: 'https://jov.ie/tim/s/spotify',
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'locked',
      rank: 7,
      previousRank: 9,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
    },
    {
      id: 'instagram',
      rowType: 'surface',
      kind: 'social',
      platform: 'instagram',
      label: 'Instagram',
      handle: '@tim',
      url: 'https://instagram.com/tim',
      trackedUrl: 'https://jov.ie/tim/s/instagram',
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'active',
      rank: 4,
      previousRank: 5,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
    },
  ],
  monitoringLimit: 5,
  monitoredCount: 1,
  qualifiedShare: 0.5,
  bestJovieRank: 2,
  lastObservedAt: '2026-07-16T00:00:00.000Z',
  providerAvailable: true,
};

function renderWorkspace(workspaceData: ProfilesWorkspaceData | null) {
  return render(
    <HeaderActionsProvider>
      <TooltipProvider>
        <RegisteredHeaderActions />
        <ProfilesWorkspace data={workspaceData} />
      </TooltipProvider>
    </HeaderActionsProvider>
  );
}

function RegisteredHeaderActions() {
  const { headerActions } = useHeaderActions();
  return <div data-testid='registered-header-actions'>{headerActions}</div>;
}

describe('ProfilesWorkspace', () => {
  it('uses the canonical empty state with a direct artist-profile action', () => {
    renderWorkspace(null);

    expect(
      screen.getByTestId('profiles-workspace-empty-state')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'No Artist Profile Selected' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Set Up Artist Profile' })
    ).toHaveAttribute('href', '/app/settings/artist-profile');
  });

  it('uses the canonical mark state contract and a compact URL display', async () => {
    renderWorkspace(data);

    const url = screen.getByTitle('https://open.spotify.com/artist/tim');
    expect(url).toHaveTextContent('open.spotify.com · artist/tim');

    const mark = screen.getByRole('img', { name: 'Spotify' });
    expect(mark).toHaveClass('relative');
    expect(
      mark.querySelector('.group-hover\\/connection-row\\:opacity-100')
    ).not.toBeNull();
    expect(
      mark.querySelector('.group-focus-visible\\/connection-row\\:opacity-100')
    ).not.toBeNull();
    expect(
      mark.querySelector(
        '.group-aria-\\[selected\\=true\\]\\/connection-row\\:opacity-100'
      )
    ).not.toBeNull();
    expect(mark.querySelector('.opacity-0')).not.toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByText('Spotify'));

    const selectedRow = screen.getByText('Spotify').closest('tr');
    expect(selectedRow).toHaveAttribute('aria-selected', 'true');

    const selectedReveal = screen
      .getByRole('img', { name: 'Spotify' })
      .querySelector('span[aria-hidden="true"]');
    expect(selectedReveal).toHaveClass('opacity-100');
    expect(selectedReveal).not.toHaveClass('opacity-0');
    expect(selectedReveal).toHaveStyle({ color: '#1DB954' });
  });

  it('keeps navigation filters compact and moves the primary action to the header', async () => {
    renderWorkspace(data);

    expect(vi.mocked(useRegisterRightPanel)).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.queryByText('Jovie Profile')).not.toBeInTheDocument();
    expect(screen.queryByText('Gmail')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'All' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DSPs' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(screen.queryByTestId('connections-summary')).not.toBeInTheDocument();
    expect(screen.queryByText('4 Connections')).not.toBeInTheDocument();
    expect(screen.queryByText('Monitored 1/5')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs Attention 1')).not.toBeInTheDocument();
    const typeGlyph = screen.getByRole('img', {
      name: 'DSP connection type',
    });
    expect(typeGlyph).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'DSP connection type' })
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('registered-header-actions')).getByRole(
        'button',
        { name: 'Add connection' }
      )
    ).toBeInTheDocument();

    const spotifyRow = screen.getByText('Spotify').closest('tr');
    expect(spotifyRow).not.toBeNull();
    expect(
      within(spotifyRow as HTMLElement)
        .getAllByText('Limit Reached')
        .some(element => element.classList.contains('sr-only'))
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'DSPs' }));
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.queryByText('Jovie Profile')).not.toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: 'Connectors' })
    ).not.toBeInTheDocument();
  });

  it('uses the row action registry to open connection-specific details', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    const action = screen.getByRole('button', {
      name: 'Actions for Spotify',
    });

    await user.click(action);
    await user.click(screen.getByRole('menuitem', { name: /View Details/i }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(
      screen.getByRole('complementary', { name: 'Connection details' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('profiles-rail-entity-header')).toHaveClass(
      'relative',
      'flex'
    );
    expect(screen.getByTestId('profiles-rail-summary')).toBeInTheDocument();
    expect(
      screen.getByTestId('profiles-rail-shareable-link')
    ).toHaveTextContent('open.spotify.com/artist/tim');
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/artist/tim'
    );
    expect(screen.getByText('Next Best Action')).toBeInTheDocument();
    expect(
      screen.getByText('Upgrade the monitoring limit to track this connection.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/app/settings/billing'
    );
  });

  it('uses the canonical Jovie URL only for supported social connections', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);
    await user.click(screen.getByRole('button', { name: 'Social' }));

    expect(
      screen.getByTitle('https://jov.ie/tim/s/instagram')
    ).toHaveTextContent('jov.ie · tim/s/instagram');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Instagram' })
    );
    await user.click(screen.getByRole('menuitem', { name: /View Details/i }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(
      screen.getByTestId('profiles-rail-shareable-link')
    ).toHaveTextContent('jov.ie/tim/s/instagram');
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      'https://instagram.com/tim'
    );
  });

  it('opens a row action menu without selecting the row via pointer or keyboard', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    const action = screen.getByRole('button', {
      name: 'Actions for Spotify',
    });

    vi.mocked(useRegisterRightPanel).mockClear();
    await user.click(action);

    expect(
      screen.getByRole('menuitem', { name: /View Details/i })
    ).toBeInTheDocument();
    expect(useRegisterRightPanel).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    vi.mocked(useRegisterRightPanel).mockClear();
    action.focus();
    await user.keyboard('{Enter}');

    expect(
      screen.getByRole('menuitem', { name: /View Details/i })
    ).toBeInTheDocument();
    expect(useRegisterRightPanel).not.toHaveBeenCalled();
  });

  it('uses the shared semantic, contextual action slot without shifting rows', () => {
    renderWorkspace(data);

    expect(
      within(screen.getByRole('columnheader', { name: 'Actions' })).getByText(
        'Actions'
      )
    ).toHaveClass('sr-only');

    const action = screen.getByRole('button', {
      name: 'Actions for Spotify',
    });
    expect(action.parentElement).not.toHaveClass('sm:opacity-0');
    expect(action.closest('td')).toHaveClass(
      'system-b-table-contextual-action-cell'
    );
  });

  it('clears connection details when the table filter changes', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    await user.click(
      screen.getByRole('button', { name: 'Actions for Spotify' })
    );
    await user.click(screen.getByRole('menuitem', { name: /View Details/i }));
    expect(
      vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0]
    ).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Social' }));
    expect(vi.mocked(useRegisterRightPanel)).toHaveBeenLastCalledWith(null);
  });

  it('opens the in-flow add rail with registry-backed services and canonical URL review', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    await user.click(screen.getByRole('button', { name: 'Add connection' }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(
      screen.getByRole('complementary', { name: 'Add connection' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Connect services/i }));
    expect(
      screen.getByRole('button', {
        name: 'Gmail Scan booking emails for tour confirmation signals.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Google Calendar/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(
      screen.getByRole('button', { name: /Add public profile/i })
    );
    const url = screen.getByRole('textbox', { name: 'Public profile URL' });
    await user.type(url, 'Instagram.com/tim/?utm_source=test');
    expect(screen.getByText(/instagram\.com\/tim/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review profile' })
    ).toBeEnabled();
  });

  it('suggests handle destinations with keyboard selection and previews a temporary row', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    await user.click(screen.getByRole('button', { name: 'Add connection' }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);

    await user.click(
      screen.getByRole('button', { name: /Add public profile/i })
    );
    const input = screen.getByRole('textbox', { name: 'Public profile URL' });
    await user.type(input, '@newhandle');

    expect(
      screen.getByRole('listbox', { name: 'Suggested profile destinations' })
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /TikTok/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await user.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveValue('https://youtube.com/@newhandle');
    expect(screen.getByText('Detected')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review profile' })
    ).toBeEnabled();

    expect(screen.getByText('Preview only · not saved')).toBeInTheDocument();

    const previewRow = screen
      .getByText('Preview only · not saved')
      .closest('tr');
    expect(previewRow).not.toBeNull();
    expect(
      within(previewRow as HTMLElement).queryByRole('button', {
        name: /Actions for/i,
      })
    ).not.toBeInTheDocument();

    vi.mocked(useRegisterRightPanel).mockClear();
    await user.click(previewRow as HTMLElement);
    expect(useRegisterRightPanel).not.toHaveBeenCalled();

    fireEvent.contextMenu(previewRow as HTMLElement);
    expect(screen.queryByText('No items found')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps secondary columns out of the selected-rail width contract', () => {
    renderWorkspace(data);

    expect(screen.getByRole('columnheader', { name: 'Rank' })).toHaveClass(
      'max-lg:hidden'
    );
    expect(screen.getByRole('columnheader', { name: 'Change' })).toHaveClass(
      'max-xl:hidden'
    );
    expect(
      screen.getByRole('columnheader', { name: 'Monitoring' })
    ).toHaveClass('max-2xl:hidden');
    expect(screen.getByTestId('connections-workspace-toolbar')).toHaveClass(
      'min-h-10',
      'px-3',
      'py-1.5'
    );
    expect(
      screen.getByRole('columnheader', { name: 'Status / Issue' })
    ).toHaveTextContent('Status / Issue');
    expect(
      within(
        screen.getByRole('columnheader', { name: 'Status / Issue' })
      ).getByText('Status / Issue')
    ).toHaveClass('sr-only');
    expect(screen.queryByTestId('connections-toolbar-actions')).toBeNull();
  });
});
