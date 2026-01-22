'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo } from 'react';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions/social-links';
import { usePreviewPanel } from '@/app/app/dashboard/PreviewPanelContext';
import { STATSIG_FLAGS } from '@/lib/flags';
import { useFeatureGate } from '@/lib/flags/client';
import { getProfileIdentity } from '@/lib/profile/profile-identity';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { useLinksPersistence } from './links/hooks/useLinksPersistence';
import { useProfileEditor } from './links/hooks/useProfileEditor';
import { useSuggestionSync } from './links/hooks/useSuggestionSync';
import {
  areLinkItemsEqual,
  convertDetectedLinksToLinkItems,
  convertLinksToDashboardFormat,
} from './links/utils/link-transformers';
import { ProfileEditorSection } from './ProfileEditorSection';

const GROUPED_LINKS_MANAGER_LOADING_KEYS = Array.from(
  { length: 4 },
  (_, i) => `grouped-links-loading-${i + 1}`
);

const GroupedLinksManager = dynamic(
  () =>
    import('@/components/dashboard/organisms/GroupedLinksManager').then(
      mod => ({
        default: mod.GroupedLinksManager,
      })
    ),
  {
    loading: () => (
      <div className='space-y-3'>
        {GROUPED_LINKS_MANAGER_LOADING_KEYS.map(key => (
          <div
            key={key}
            className='h-16 animate-pulse rounded-lg bg-surface-1'
          />
        ))}
      </div>
    ),
    ssr: false,
  }
);

export function EnhancedDashboardLinks({
  initialLinks,
}: Readonly<{
  initialLinks: ProfileSocialLink[];
}>) {
  // Feature gate for suggestions
  const linkIngestionGate = useFeatureGate(STATSIG_FLAGS.LINK_INGESTION);
  const suggestionsEnabled = linkIngestionGate?.value ?? false;

  // Profile editing hook
  const {
    artist,
    isMusicProfile,
    profileId,
    profileDisplayName,
    profileUsername,
    editingField,
    setEditingField,
    displayNameInputRef,
    usernameInputRef,
    handleAvatarUpload,
    handleDisplayNameChange,
    handleUsername,
    handleInputKeyDown,
    handleInputBlur,
  } = useProfileEditor();

  // Get sidebar state early to gate polling
  const { setPreviewData, isOpen: sidebarOpen } = usePreviewPanel();

  // Links persistence hook
  const {
    links,
    setLinks,
    linksVersion,
    setLinksVersion,
    suggestedLinks,
    setSuggestedLinks,
    autoRefreshUntilMs,
    setAutoRefreshUntilMs,
    debouncedSave,
    enqueueSave,
    linksRef,
  } = useLinksPersistence({
    profileId,
    initialLinks,
    suggestionsEnabled,
    onSyncSuggestions: undefined, // Will be set after useSuggestionSync
  });

  // Suggestion sync hook - polling pauses when sidebar is open
  const { handleAcceptSuggestion, handleDismissSuggestion } = useSuggestionSync(
    {
      profileId,
      suggestionsEnabled,
      autoRefreshUntilMs,
      setAutoRefreshUntilMs,
      linksVersion,
      setLinksVersion,
      setLinks,
      setSuggestedLinks,
      sidebarOpen,
    }
  );

  // Handle links change from GroupedLinksManager
  const handleManagerLinksChange = useCallback(
    (updated: DetectedLink[]) => {
      const mapped = convertDetectedLinksToLinkItems(updated);
      let shouldSave = false;
      const currentLinksLength = linksRef.current?.length ?? 0;
      const isAdd = mapped.length > currentLinksLength;

      setLinks(prev => {
        if (areLinkItemsEqual(prev, mapped)) {
          return prev;
        }
        shouldSave = true;
        return mapped;
      });

      if (shouldSave) {
        if (isAdd) {
          debouncedSave.cancel();
          enqueueSave(mapped);
        } else {
          debouncedSave(mapped);
        }
      }
    },
    [debouncedSave, enqueueSave, linksRef, setLinks]
  );

  // Get profile identity for preview
  const { username, displayName, profilePath } = getProfileIdentity({
    profileUsername,
    profileDisplayName,
    artistHandle: artist?.handle,
    artistName: artist?.name,
  });
  const avatarUrl = artist?.image_url || null;

  // Convert links for preview panel
  const dashboardLinks = useMemo(
    () => convertLinksToDashboardFormat(links),
    [links]
  );

  // Sync preview data
  useEffect(() => {
    setPreviewData({
      username,
      displayName,
      avatarUrl: avatarUrl || null,
      links: dashboardLinks,
      profilePath,
    });
  }, [
    avatarUrl,
    dashboardLinks,
    displayName,
    profilePath,
    setPreviewData,
    username,
  ]);

  return (
    <div
      className='min-w-0 min-h-screen'
      data-testid='enhanced-dashboard-links'
    >
      <div className='w-full min-w-0 space-y-4'>
        {/* Profile editor section - hidden when sidebar is open */}
        {!sidebarOpen && profileId && artist && (
          <ProfileEditorSection
            artist={artist}
            avatarUrl={avatarUrl}
            username={username}
            displayName={displayName}
            editingField={editingField}
            setEditingField={setEditingField}
            displayNameInputRef={displayNameInputRef}
            usernameInputRef={usernameInputRef}
            profileDisplayName={profileDisplayName}
            profileUsername={profileUsername}
            onDisplayNameChange={handleDisplayNameChange}
            onUsernameChange={handleUsername}
            onAvatarUpload={handleAvatarUpload}
            onInputKeyDown={handleInputKeyDown}
            onInputBlur={handleInputBlur}
          />
        )}

        <GroupedLinksManager
          initialLinks={links as unknown as DetectedLink[]}
          onLinksChange={handleManagerLinksChange}
          creatorName={artist?.name ?? undefined}
          isMusicProfile={isMusicProfile}
          suggestedLinks={
            suggestionsEnabled ? (suggestedLinks as DetectedLink[]) : []
          }
          onAcceptSuggestion={
            suggestionsEnabled ? handleAcceptSuggestion : undefined
          }
          onDismissSuggestion={
            suggestionsEnabled ? handleDismissSuggestion : undefined
          }
          suggestionsEnabled={suggestionsEnabled}
          profileId={profileId}
          sidebarOpen={sidebarOpen}
        />
      </div>
    </div>
  );
}
