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

  @Test func uiTestingChatAllComponentsYieldsChatDefaultAndResolvesArg() {
    #expect(LaunchMode.uiTestingChatAllComponents.defaultInitialTab == .chat)
    #expect(LaunchMode.uiTestingChatAllComponents.opensChatOnLaunch)
    #expect(LaunchMode.uiTestingChatAllComponents.usesLiveAuth == false)
    #expect(LaunchMode.uiTestingChatAllComponents.needsChatRepository)
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-chat-all-components"], isXCTest: false)
        == .uiTestingChatAllComponents
    )
    #expect(
      LaunchMode.uiTestingChatAllComponents.chatEntityFixture
        == MobileChatAllComponentsFixture.default
    )
    #expect(
      LaunchMode.uiTestingChatAllComponents.chatFixtureConversationID
        == MobileChatAllComponentsFixture.conversationID
    )
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

  @Test func keyboardDismissesOnDownwardDragPastThreshold() {
    #expect(MobileChatKeyboardPolicy.shouldDismissOnDownwardDrag(translationHeight: 41))
    #expect(MobileChatKeyboardPolicy.shouldDismissOnDownwardDrag(translationHeight: 40) == false)
  }

  @Test func composerTrailingSlotIsMicWhenEmptyAndSendWhenTyped() {
    #expect(ChatComposerTrailingAction.action(draftIsEmpty: true) == .mic)
    #expect(ChatComposerTrailingAction.action(draftIsEmpty: false) == .send)
    #expect(ChatComposerTrailingAction.mic.accessibilityIdentifier == "chat-composer-mic")
    #expect(ChatComposerTrailingAction.send.accessibilityIdentifier == "chat-composer-send")
    #expect(ChatComposerTrailingAction.mic.accessibilityLabel == "Talk")
    #expect(ChatComposerTrailingAction.send.accessibilityLabel == "Send")
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
    #expect(ChatComposerMetrics.barHeight == 52)
    #expect(ChatComposerMetrics.sendSlotSize == JovieActionButtonMetrics.height)
    #expect(ChatComposerMetrics.plusButtonSize == JovieActionButtonMetrics.height)
    #expect(JovieActionButtonMetrics.height == 32)
    #expect(JovieActionButtonMetrics.radius == 999)
    #expect(JovieActionButtonMetrics.labelWeight == 510)
    #expect(ChatComposerMetrics.sendSlotSize <= ChatComposerMetrics.barHeight)
  }

  @Test func emptyChatGreetingRotatesLockedSetOnly() {
    #expect(
      ChatEmptyGreeting.lockedCopy == [
        "Let's get it",
        "Ready to start?",
        "Ready when you are",
      ]
    )
    #expect(ChatEmptyGreeting.lockedCopy.contains("What's next?") == false)
    #expect(ChatEmptyGreeting.lockedCopy.contains("Ask Jovie") == false)
    #expect(ChatComposerCopy.emptyPlaceholder.isEmpty)

    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
    let dayZero = Date(timeIntervalSince1970: 0)
    let greeting = ChatEmptyGreeting.current(at: dayZero, calendar: calendar)
    #expect(ChatEmptyGreeting.isLocked(greeting))

    let nextDay = Date(timeIntervalSince1970: 86_400)
    let rotated = ChatEmptyGreeting.current(at: nextDay, calendar: calendar)
    #expect(ChatEmptyGreeting.isLocked(rotated))
    #expect(greeting != rotated)

    #expect(JovieFont.emptyGreetingSize == 28)
    #expect(JovieFont.emptyGreetingWeight == 620)
    #expect(JovieFont.uiFontWeightRawValue(forCSSWeight: 510) > 0.23)
    #expect(JovieFont.uiFontWeightRawValue(forCSSWeight: 510) < 0.3)
    #expect(JovieFont.uiFontWeightRawValue(forCSSWeight: 620) > 0.3)
    #expect(JovieFont.uiFontWeightRawValue(forCSSWeight: 620) < 0.4)
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

  @Test func chatFirstHomeDoesNotUseBottomTabs() {
    #expect(appShellHomeSurface(chatEnabled: true) == .chat)
    #expect(AppShellPanePolicy.showsBottomTabBar() == false)
    #expect(AppShellGesturePolicy.shouldSwitchTabFromHorizontalSwipe() == false)
  }
}
