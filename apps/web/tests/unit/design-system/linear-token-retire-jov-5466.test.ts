import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), 'utf8');
}

const RETIRED = /--linear-app-/;

describe('JOV-5466 --linear-app-* retire', () => {
  it('keeps components/features/admin/FunnelMetricsStrip.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/FunnelMetricsStrip.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/ReliabilityCard.tsx off retired linear-app tokens', () => {
    const source = readSource('components/features/admin/ReliabilityCard.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/SentryMetricsCard.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/SentryMetricsCard.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/campaigns/InviteCampaignManager.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/campaigns/InviteCampaignManager.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/hud/FounderFunnelBand.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/hud/FounderFunnelBand.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/hud/HudShipperPanels.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/hud/HudShipperPanels.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/hud/HudSystemHealthStrip.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/hud/HudSystemHealthStrip.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/leads/GrowthStatusPanel.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/leads/GrowthStatusPanel.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/leads/GtmCollapsibles.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/leads/GtmCollapsibles.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/leads/GtmSpeedDial.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/leads/GtmSpeedDial.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/leads/LeadGtmInsights.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/leads/LeadGtmInsights.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/leads/LeadKeywordsManager.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/leads/LeadKeywordsManager.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/leads/LeadPipelineControls.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/leads/LeadPipelineControls.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/leads/UnifiedUrlIntake.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/leads/UnifiedUrlIntake.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/outreach/DmQueuePanel.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/outreach/DmQueuePanel.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/outreach/EmailQueuePanel.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/outreach/EmailQueuePanel.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/outreach/OutreachKpis.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/outreach/OutreachKpis.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/outreach/OutreachOverviewPanel.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/outreach/OutreachOverviewPanel.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/outreach/ReviewQueuePanel.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/outreach/ReviewQueuePanel.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/table/AdminCreatorsTableHeader.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/table/AdminCreatorsTableHeader.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/admin/table/AdminTablePagination.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/admin/table/AdminTablePagination.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/alerts/AlertGrowthLanding.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/alerts/AlertGrowthLanding.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/auth/AuthBrandPanel.tsx off retired linear-app tokens', () => {
    const source = readSource('components/features/auth/AuthBrandPanel.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/atoms/CategorySection.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/atoms/CategorySection.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/atoms/DashboardHeaderActionGroup.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/atoms/DashboardHeaderActionGroup.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/audience/table/molecules/AudienceTableHeader.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/audience/table/molecules/AudienceTableHeader.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/molecules/ProfileLiveCelebration.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/molecules/ProfileLiveCelebration.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/molecules/UniversalLinkInputUrlMode.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/molecules/UniversalLinkInputUrlMode.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/GetStartedChecklistCard.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/GetStartedChecklistCard.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/MobileProfileDrawer.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/MobileProfileDrawer.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/MusicImportHero.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/MusicImportHero.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/OnboardingFormWrapper.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/OnboardingFormWrapper.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/OnboardingHandleOnlyForm.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/OnboardingHandleOnlyForm.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/SettingsPolished.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/SettingsPolished.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/SettingsSection.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/SettingsSection.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/artist-selection-form/ArtistSelectionForm.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/artist-selection-form/ArtistSelectionForm.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/dsp-presence/DspPresenceTable.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/dsp-presence/DspPresenceTable.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/links/ChatStyleLinkItem.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/links/ChatStyleLinkItem.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/links/IngestedSuggestions.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/links/IngestedSuggestions.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/onboarding/OnboardingHandleStep.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/onboarding/OnboardingHandleStep.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/onboarding/OnboardingNameStep.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/onboarding/OnboardingNameStep.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/profile-contact-sidebar/ProfileAboutTab.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/profile-contact-sidebar/ProfileAboutTab.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/profile-contact-sidebar/SidebarLinkInput.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/profile-contact-sidebar/SidebarLinkInput.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/releases/ReleaseEditDialog.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/releases/ReleaseEditDialog.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/releases/components/AddProviderUrlPopover.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/releases/components/AddProviderUrlPopover.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/releases/components/ProviderStatusDot.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/releases/components/ProviderStatusDot.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/organisms/table/TableToolbar.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/organisms/table/TableToolbar.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/release-tasks/MetadataAgentPanel.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/release-tasks/MetadataAgentPanel.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/dashboard/tasks/TaskDescriptionHelper.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/dashboard/tasks/TaskDescriptionHelper.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/demo/DemoReleaseDetail.tsx off retired linear-app tokens', () => {
    const source = readSource('components/features/demo/DemoReleaseDetail.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/demo/DemoReleasesPanel.tsx off retired linear-app tokens', () => {
    const source = readSource('components/features/demo/DemoReleasesPanel.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/demo/DemoSettingsPanel.tsx off retired linear-app tokens', () => {
    const source = readSource('components/features/demo/DemoSettingsPanel.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/demo/DemoShell.tsx off retired linear-app tokens', () => {
    const source = readSource('components/features/demo/DemoShell.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/demo/FounderDemoRecordingSurface.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/demo/FounderDemoRecordingSurface.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/home/ProductScreenshotFrame.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/home/ProductScreenshotFrame.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/onboarding/OnboardingChat.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/onboarding/OnboardingChat.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/onboarding/OnboardingExperienceShell.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/onboarding/OnboardingExperienceShell.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/onboarding/OnboardingProfileRail.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/onboarding/OnboardingProfileRail.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/profile/UtmBuilderDialog.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/profile/UtmBuilderDialog.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/release/AudioWaveformEditor.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/release/AudioWaveformEditor.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/features/release/ReleaseAudioAssetPanel.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/features/release/ReleaseAudioAssetPanel.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/jovie/JovieChat.tsx off retired linear-app tokens', () => {
    const source = readSource('components/jovie/JovieChat.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/jovie/components/ChatAnalyticsCard.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/jovie/components/ChatAnalyticsCard.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/jovie/components/ChatUsageAlert.tsx off retired linear-app tokens', () => {
    const source = readSource('components/jovie/components/ChatUsageAlert.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/jovie/components/FeedbackForm.tsx off retired linear-app tokens', () => {
    const source = readSource('components/jovie/components/FeedbackForm.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/organisms/table/molecules/ActionBar.tsx off retired linear-app tokens', () => {
    const source = readSource(
      'components/organisms/table/molecules/ActionBar.tsx'
    );
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/shell/JovieOverlay.tsx off retired linear-app tokens', () => {
    const source = readSource('components/shell/JovieOverlay.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/shell/LyricsRouteSkeleton.tsx off retired linear-app tokens', () => {
    const source = readSource('components/shell/LyricsRouteSkeleton.tsx');
    expect(source).not.toMatch(RETIRED);
  });

  it('keeps components/shell/TasksRouteSkeleton.tsx off retired linear-app tokens', () => {
    const source = readSource('components/shell/TasksRouteSkeleton.tsx');
    expect(source).not.toMatch(RETIRED);
  });
});
