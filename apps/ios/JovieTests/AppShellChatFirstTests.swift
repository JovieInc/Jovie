import Foundation
import Testing
@testable import Jovie

struct AppShellChatFirstTests {
  // Chat is the permanent home: live and unspecified launch modes default to .chat.
  @Test func liveModeSetsDefaultInitialTabToChat() {
    #expect(LaunchMode.live.defaultInitialTab == .chat)
  }

  // UI-testing modes that assert Profile-tab content keep .profile so existing
  // test assertions (Copy URL, QR code) don't require extra navigation steps.
  @Test func uiTestingReadyKeepsProfileDefault() {
    #expect(LaunchMode.uiTestingReady.defaultInitialTab == .profile)
  }

  @Test func uiTestingSettingsKeepsProfileDefault() {
    #expect(LaunchMode.uiTestingSettings.defaultInitialTab == .profile)
  }

  @Test func uiTestingQRUnavailableKeepsProfileDefault() {
    #expect(LaunchMode.uiTestingQRUnavailable.defaultInitialTab == .profile)
  }

  @Test func uiTestingAuthCallbackKeepsProfileDefault() {
    #expect(LaunchMode.uiTestingAuthCallback.defaultInitialTab == .profile)
  }

  @Test func uiTestingVenueModeKeepsProfileDefault() {
    #expect(LaunchMode.uiTestingVenueMode.defaultInitialTab == .profile)
  }

  // Chat-only launch modes also yield .chat as their default.
  @Test func uiTestingChatYieldsChatDefault() {
    #expect(LaunchMode.uiTestingChat.defaultInitialTab == .chat)
  }

  @Test func uiTestingAudienceYieldsChatDefault() {
    #expect(LaunchMode.uiTestingAudience.defaultInitialTab == .chat)
  }

  // resolvedInitialTab: exposed as internal for testing; chat → chat when
  // chatEnabled, falls back to profile when disabled.
  @Test func resolvedInitialTabReturnsChatWhenEnabled() {
    #expect(resolveShellInitialTab(.chat, chatEnabled: true) == .chat)
  }

  @Test func resolvedInitialTabFallsToProfileWhenChatDisabled() {
    #expect(resolveShellInitialTab(.chat, chatEnabled: false) == .profile)
  }

  @Test func resolvedInitialTabPassesThroughProfileTab() {
    #expect(resolveShellInitialTab(.profile, chatEnabled: true) == .profile)
  }

  @Test func keyboardDismissesOnStreamingStartWhenUserHasNotEditedSinceSend() {
    #expect(MobileChatKeyboardPolicy.shouldDismissOnStreamingStart(userEditedSinceSend: false))
  }

  @Test func keyboardStaysOpenOnStreamingStartWhenUserEditedSinceSend() {
    #expect(MobileChatKeyboardPolicy.shouldDismissOnStreamingStart(userEditedSinceSend: true) == false)
  }

  @Test func keepsChatMountedAcrossTabs() {
    #expect(appShellKeepsChatMountedAcrossTabs())
  }

  @Test func showsChatUnderlayForEveryTabWhenChatEnabled() {
    #expect(appShellShowsChatUnderlay(selectedTab: .chat, chatEnabled: true))
    #expect(appShellShowsChatUnderlay(selectedTab: .library, chatEnabled: true))
    #expect(appShellShowsChatUnderlay(selectedTab: .calendar, chatEnabled: true))
    #expect(appShellShowsChatUnderlay(selectedTab: .inbox, chatEnabled: true))
    #expect(appShellShowsChatUnderlay(selectedTab: .profile, chatEnabled: true))
    #expect(appShellShowsChatUnderlay(selectedTab: .audience, chatEnabled: true))
  }

  @Test func hidesChatUnderlayWhenChatDisabled() {
    #expect(appShellShowsChatUnderlay(selectedTab: .chat, chatEnabled: false) == false)
    #expect(appShellShowsChatUnderlay(selectedTab: .library, chatEnabled: false) == false)
  }

  @Test func autoScrollsOnlyWhilePinnedToLatest() {
    #expect(MobileChatScrollPolicy.shouldAutoScrollToLatest(isAtBottom: true))
    #expect(MobileChatScrollPolicy.shouldAutoScrollToLatest(isAtBottom: false) == false)
  }

  @Test func jumpToLatestAppearsOnlyAfterUserScrollsAway() {
    #expect(MobileChatScrollPolicy.shouldShowJumpToLatest(isAtBottom: false))
    #expect(MobileChatScrollPolicy.shouldShowJumpToLatest(isAtBottom: true) == false)
  }

  @Test func composerSendStaysDisabledForEmptyOrInFlightDrafts() {
    #expect(ChatComposerMetrics.isSendEnabled(trimmedDraft: "", isSending: false) == false)
    #expect(ChatComposerMetrics.isSendEnabled(trimmedDraft: "Ask Jovie", isSending: true) == false)
    #expect(ChatComposerMetrics.isSendEnabled(trimmedDraft: "Ask Jovie", isSending: false))
  }

  @Test func composerPlusDisablesWhileSending() {
    #expect(ChatComposerMetrics.isPlusEnabled(isSending: false))
    #expect(ChatComposerMetrics.isPlusEnabled(isSending: true) == false)
  }

  @Test func composerGeometryReservesSendSlotWithoutGrowingTheBar() {
    #expect(ChatComposerMetrics.barHeight == 76)
    #expect(ChatComposerMetrics.sendSlotSize == 52)
    #expect(ChatComposerMetrics.plusButtonSize == 36)
    #expect(ChatComposerMetrics.sendSlotSize < ChatComposerMetrics.barHeight)
  }

  @Test func waitlistLaunchStaysOffTheAppShell() {
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-waitlist-pending"], isXCTest: false)
        == .uiTestingWaitlistPending
    )
    #expect(LaunchMode.uiTestingWaitlistPending.usesLiveAuth == false)
    #expect(LaunchMode.uiTestingWaitlistPending.opensChatOnLaunch == false)
    #expect(LaunchMode.uiTestingWaitlistPending.needsChatRepository == false)
  }

  @Test func transcriptDropsMotionUnderReduceMotion() {
    #expect(MobileChatTranscriptMotion.rowInsertion(reduceMotion: true) == nil)
    #expect(MobileChatTranscriptMotion.jumpToLatest(reduceMotion: true) == nil)
    #expect(MobileChatTranscriptMotion.rowInsertion(reduceMotion: false) != nil)
    #expect(MobileChatTranscriptMotion.jumpToLatest(reduceMotion: false) != nil)
  }

  @Test func transcriptSourceNeverOffsetsOrScalesRows() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("Jovie/Features/Chat/MobileChatView.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    #expect(source.contains("MobileChatTranscriptMotion.rowTransition"))
    #expect(source.contains("MobileChatTranscriptMotion.jumpToLatestTransition"))
    #expect(!source.contains(".offset(y: 6)"))
    #expect(!source.contains("scale(scale: 0.85)"))
    #expect(!source.contains("easeOut(duration: 0.25)"))
    #expect(!source.contains(".spring(duration: 0.2)"))
  }
}
