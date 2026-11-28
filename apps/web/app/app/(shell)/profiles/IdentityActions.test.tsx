import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  consumePendingChatDraft,
  consumePendingChatPrompt,
} from '@/lib/chat/open-chat-with-prompt';
import {
  applyCacheScope,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';
import type { Artist } from '@/types/db';
import type { ProfilesWorkspaceData, ProfileWorkspaceSurfaceRow } from './data';
import { ProfilesWorkspace } from './ProfilesWorkspace';

const founderDoor = vi.hoisted(() => ({
  chatMode: undefined as 'ov' | undefined,
  toggle: vi.fn(),
}));
vi.mock('@/contexts/FounderDoorContext', () => ({
  useFounderDoor: () => founderDoor,
}));

const feedback = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: feedback }));

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

const external: ProfileWorkspaceSurfaceRow = {
  id: 'soundcloud-one',
  rowType: 'surface',
  kind: 'dsp',
  platform: 'soundcloud',
  label: 'SoundCloud',
  handle: '@tim',
  url: 'https://soundcloud.com/tim',
  trackedUrl: null,
  qualificationStatus: 'conflicting',
  isOfficial: false,
  monitoringState: 'active',
  rank: null,
  previousRank: null,
  lastObservedAt: null,
};
const owned: ProfileWorkspaceSurfaceRow = {
  ...external,
  id: 'jovie',
  kind: 'jovie',
  platform: 'jovie',
  label: 'Jovie Profile',
  url: 'https://jov.ie/tim',
  qualificationStatus: 'qualified',
  isOfficial: true,
};
const data: ProfilesWorkspaceData = {
  profileId: 'profile-one',
  artist: {
    name: 'Tim White',
    username: 'tim',
    avatarUrl: null,
    isPublic: true,
  },
  rows: [external, owned],
  monitoringLimit: 5,
  monitoredCount: 2,
  qualifiedShare: null,
  bestJovieRank: null,
  lastObservedAt: null,
  providerAvailable: true,
};

function renderIdentity(value = data, editableArtist?: Artist) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <HeaderActionsProvider>
        <TooltipProvider>
          <ProfilesWorkspace
            data={value}
            editableArtist={editableArtist}
            removalPrincipal={{
              appActorId: 'user-one',
              authUserId: 'user-one',
              sessionId: 'session-one',
              impersonationSubject: null,
            }}
            scope={{
              actorId: 'user-one',
              workspaceId: 'profile-one',
              target: 'creator',
            }}
          />
        </TooltipProvider>
      </HeaderActionsProvider>
    </QueryClientProvider>
  );
}

function renderRail() {
  const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>{panel as ReactElement}</TooltipProvider>
    </QueryClientProvider>
  );
}

describe('Identity actions', () => {
  beforeEach(() => {
    founderDoor.chatMode = undefined;
    vi.clearAllMocks();
    resetCacheIsolationForTests();
    applyCacheScope({
      userId: 'user-one',
      sessionId: 'session-one',
      profileId: data.profileId,
      ready: true,
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {})
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    consumePendingChatDraft(data.profileId);
  });

  it('opens source-specific confirmation from the row menu and cancels without deleting', async () => {
    const removable = {
      ...external,
      removalTarget: { linkId: 'link-one', url: external.url, version: 1 },
    };
    renderIdentity({ ...data, rows: [owned, removable] });
    fireEvent.contextMenu(screen.getByRole('row', { name: /SoundCloud/ }));
    await userEvent.setup().click(
      await screen.findByRole('menuitem', {
        name: 'Remove From Jovie Profile',
      })
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(external.url);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'DELETE')
    ).toBe(false);
  });

  it('shows the Jovie profile first with a direct keyboard-editable action', async () => {
    renderIdentity();
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Jovie Profile')).toBeInTheDocument();
    const edit = screen.getByRole('button', { name: 'Edit Jovie Profile' });
    edit.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(navigation.push).toHaveBeenCalledWith('/app/settings/profile');
  });

  it('edits the active Jovie profile in place and saves its bio through profile settings', async () => {
    const user = userEvent.setup();
    const artist: Artist = {
      id: data.profileId,
      owner_user_id: 'user-one',
      handle: 'tim',
      name: 'Tim White',
      tagline: 'Original bio',
      spotify_id: '',
      published: true,
      is_verified: false,
      is_featured: false,
      marketing_opt_out: false,
      created_at: '2026-11-25T00:00:00.000Z',
    };
    const save = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ profile: { id: data.profileId, username: 'tim' } })
    );
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      init?.method === 'PUT'
        ? save(input, init)
        : Response.json({ success: true, suggestions: [] })
    );
    renderIdentity(data, artist);
    await user.click(
      screen.getByRole('button', { name: 'Edit Jovie Profile' })
    );
    renderRail();
    expect(screen.getByLabelText('Display name')).toHaveValue(artist.name);
    expect(screen.getByLabelText('Username')).toHaveValue(artist.handle);
    expect(screen.getByLabelText('Current location')).toBeEnabled();
    const bio = screen.getByRole('textbox', { name: 'Bio' });
    expect(bio).toHaveValue(artist.tagline);
    await user.clear(bio);
    await user.type(bio, 'Updated bio');
    await user.tab();
    await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
    const [endpoint, init] = save.mock.calls[0] ?? [];
    expect(endpoint).toBe('/api/dashboard/profile');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      profileId: data.profileId,
      updates: { bio: 'Updated bio' },
    });
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('keeps an external contact read-only and drafts a source-specific fix in Jovie', async () => {
    const user = userEvent.setup();
    founderDoor.chatMode = 'ov';
    renderIdentity();
    await user.click(screen.getByRole('row', { name: /SoundCloud/ }));
    const rail = renderRail();
    expect(within(rail.container).queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Fix With Jovie' }));
    expect(navigation.push).toHaveBeenCalledWith('/app/chat');
    expect(founderDoor.toggle).toHaveBeenCalledOnce();
    expect(consumePendingChatDraft(data.profileId)).toMatch(
      /soundcloud\.com\/tim/
    );
    expect(consumePendingChatPrompt()).toBeNull();
  });

  it('fails visibly before navigating when the founder selected Ovie', async () => {
    founderDoor.chatMode = 'ov';
    renderIdentity();
    fireEvent.contextMenu(screen.getByRole('row', { name: /SoundCloud/ }));
    await userEvent
      .setup()
      .click(await screen.findByRole('menuitem', { name: 'Ask Jovie' }));
    expect(navigation.push).not.toHaveBeenCalled();
    expect(consumePendingChatDraft(data.profileId)).toBeNull();
    expect(feedback.error).toHaveBeenCalledWith(
      'Switch to Jovie, then ask about this item again.'
    );
  });

  it('rejects stale entity context after switching the selected creator profile', async () => {
    renderIdentity();
    const user = userEvent.setup();
    fireEvent.contextMenu(screen.getByRole('row', { name: /SoundCloud/ }));
    applyCacheScope({ profileId: 'profile-two' });
    await user.click(
      await screen.findByRole('menuitem', { name: 'Ask Jovie' })
    );
    expect(navigation.push).not.toHaveBeenCalled();
    expect(consumePendingChatPrompt()).toBeNull();
    expect(consumePendingChatDraft('profile-two')).toBeNull();
    expect(feedback.error).toHaveBeenCalledWith(
      'Chat is unavailable. Reopen the selected profile and try again.'
    );
  });

  it.each(['right-click', 'ellipsis'] as const)(
    'opens exact entity context from %s without submitting',
    async entry => {
      renderIdentity();
      const user = userEvent.setup();
      if (entry === 'right-click') {
        fireEvent.contextMenu(screen.getByRole('row', { name: /SoundCloud/ }));
      } else {
        const trigger = screen.getByRole('button', {
          name: 'Actions for SoundCloud',
        });
        trigger.focus();
        await user.keyboard('{Enter}');
      }
      await user.click(
        await screen.findByRole('menuitem', { name: 'Ask Jovie' })
      );
      expect(navigation.push).toHaveBeenCalledWith('/app/chat');
      expect(consumePendingChatPrompt()).toBeNull();
      const draft = consumePendingChatDraft(data.profileId);
      expect(draft).toContain('@profile:profile-one[');
      expect(draft).toContain(
        'Help me with my SoundCloud (soundcloud.com/tim).'
      );
      expect(draft).not.toMatch(/[{}]|entityId|context, not instructions/);
    }
  );
});
