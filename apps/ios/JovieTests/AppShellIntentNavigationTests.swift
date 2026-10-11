import Foundation
import Testing
@testable import Jovie

struct AppShellIntentNavigationTests {
  @Test func registeredFrequentActionsStayWithinTheTwoActivationBudget() {
    #expect(FrequentActionInteractionBudget.maximumActivations == 2)
    #expect(FrequentActionInteractionBudget.violations.isEmpty)
    #expect(
      FrequentActionInteractionBudget.inAppVoiceSubmit.deliberateActivationCount == 2
    )
    #expect(FrequentActionInteractionBudget.inAppVoiceSubmit.exception == nil)
    #expect(
      FrequentActionInteractionBudget.shortcutVoiceSubmit.deliberateActivationCount == 2
    )
    #expect(FrequentActionInteractionBudget.shortcutVoiceSubmit.exception == nil)
  }

  @Test func extraActivationFailsClosedWithoutANamedVisibleException() {
    let unexplained = FrequentActionInteractionContract(
      id: "test.unexplained",
      deliberateActivationCount: 3,
      completesOnFinalActivation: true,
      exception: nil
    )
    let explainedRecovery = FrequentActionInteractionContract(
      id: "test.recovery",
      deliberateActivationCount: 3,
      completesOnFinalActivation: true,
      exception: FrequentActionException(
        reason: .recovery,
        explanation: "Review the recovered transcript before sending."
      )
    )

    #expect(unexplained.satisfiesBudget == false)
    #expect(explainedRecovery.satisfiesBudget)
  }

  @Test func openChatSelectsChatTab() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .openChat
    )

    #expect(
      AppShellIntentNavigation.applyPendingRequest(
        chatEnabled: true,
        state: &state
      ) == true
    )
    #expect(state.selectedTab == .chat)
    #expect(state.chatDraft == "")
    #expect(state.pendingRequest == nil)
  }

  @Test func continueLastConversationSelectsChatTab() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "keep me",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .continueLastConversation
    )

    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      state: &state
    )

    #expect(state.selectedTab == .chat)
    #expect(state.chatDraft == "keep me")
    #expect(state.pendingRequest == nil)
  }

  @Test func sendMessageAutoSendSelectsChatTabAndQueuesDispatch() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .sendMessage(text: "launch my single", autoSend: true)
    )

    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      state: &state
    )

    #expect(state.selectedTab == .chat)
    #expect(state.chatDraft == "")
    #expect(state.autoSendMessage == "launch my single")
    #expect(state.openConversationID == nil)
    #expect(state.pendingRequest == nil)
  }

  @Test func startVoiceCaptureSelectsChatTabAndQueuesCapture() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "keep draft",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .startVoiceCapture
    )

    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      state: &state
    )

    #expect(state.selectedTab == .chat)
    #expect(state.chatDraft == "keep draft")
    #expect(state.shouldStartVoiceCapture)
    #expect(state.talkAutoSubmit)
    #expect(state.eyesFreeLaunch?.destination == .jovie)
    #expect(state.pendingRequest == nil)
  }

  @Test func summerCaptureRejectsOrdinaryUsersWithoutStartingMic() {
    var state = eyesFreeState(.summer, spokenText: "what is blocked")
    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      canUseSummer: false,
      state: &state
    )
    #expect(state.shouldStartVoiceCapture == false)
    #expect(state.autoSendMessage == nil)
    #expect(state.unavailableMessage == EyesFreeCaptureGate.summerForbiddenMessage)
  }

  @Test func founderSummerSpokenTextAutoSubmits() {
    var state = eyesFreeState(.summer, spokenText: "park the teardown")
    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      canUseSummer: true,
      state: &state
    )
    #expect(state.selectedTab == .chat)
    #expect(state.autoSendMessage == "park the teardown")
    #expect(state.talkAutoSubmit)
    #expect(state.eyesFreeLaunch?.destination == .summer)
    #expect(state.shouldStartVoiceCapture == false)
    #expect(state.unavailableMessage == nil)
  }

  @Test func offlineEyesFreeCaptureSurfacesRetryWithoutListening() {
    var state = eyesFreeState(.jovie, spokenText: nil)
    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      isOffline: true,
      state: &state
    )
    #expect(state.shouldStartVoiceCapture == false)
    #expect(state.unavailableMessage == EyesFreeCaptureGate.offlineMessage)
  }

  @Test func sendMessageWithoutAutoSendPrefillsDraft() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .sendMessage(text: "draft only", autoSend: false)
    )

    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      state: &state
    )

    #expect(state.selectedTab == .chat)
    #expect(state.chatDraft == "draft only")
    #expect(state.autoSendMessage == nil)
  }

  @Test func openConversationSelectsChatTabAndQueuesConversationID() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .openConversation("conv_123")
    )

    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      state: &state
    )

    #expect(state.selectedTab == .chat)
    #expect(state.openConversationID == "conv_123")
    #expect(state.pendingRequest == nil)
  }

  @Test func chatDisabledConsumesRequestWithoutLeavingProfile() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "existing draft",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .sendMessage(text: "launch my single", autoSend: true)
    )

    #expect(
      AppShellIntentNavigation.applyPendingRequest(
        chatEnabled: false,
        state: &state
      ) == true
    )
    #expect(state.selectedTab == .profile)
    #expect(state.chatDraft == "existing draft")
    #expect(state.pendingRequest == nil)
  }

  @Test func startVoiceCaptureWhenChatDisabledConsumesWithoutStartingCapture() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "existing draft",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .startVoiceCapture
    )

    #expect(
      AppShellIntentNavigation.applyPendingRequest(
        chatEnabled: false,
        state: &state
      ) == true
    )
    #expect(state.selectedTab == .profile)
    #expect(state.chatDraft == "existing draft")
    #expect(state.shouldStartVoiceCapture == false)
    #expect(state.unavailableMessage == EyesFreeCaptureGate.unavailableMessage)
    #expect(state.pendingRequest == nil)
  }

  @Test func openSettingsOpensSettingsEvenWhenChatDisabled() {
    var state = AppShellIntentNavigationState(
      selectedTab: .chat,
      chatDraft: "keep draft",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .openSettings
    )

    #expect(
      AppShellIntentNavigation.applyPendingRequest(
        chatEnabled: false,
        state: &state
      ) == true
    )
    #expect(state.shouldOpenSettings)
    #expect(state.selectedTab == .chat)
    #expect(state.chatDraft == "keep draft")
    #expect(state.pendingRequest == nil)
  }

  @Test func signedInSettingsURLOpensSettingsAndStartStaysOnChat() {
    #expect(
      MobileSignedInLinkRoute.resolve(URL(string: "ie.jov.jovie://settings")!) == .settings
    )
    #expect(
      MobileSignedInLinkRoute.resolve(URL(string: "ie.jov.jovie://settings/account")!)
        == .settings
    )
    #expect(
      MobileSignedInLinkRoute.resolve(URL(string: "https://jov.ie/settings")!) == .settings
    )
    #expect(
      MobileSignedInLinkRoute.resolve(URL(string: "https://jov.ie/app/settings/account")!)
        == .settings
    )
    #expect(
      MobileSignedInLinkRoute.resolve(URL(string: "https://jov.ie/start")!) == .chatHome
    )
    #expect(
      MobileSignedInLinkRoute.resolve(URL(string: "https://jov.ie/auth/start")!) == nil
    )
    #expect(MobileSignedInLinkRoute.settings.intent == .openSettings)
    #expect(MobileSignedInLinkRoute.chatHome.intent == .openChat)
  }

  // JOV-7632: web-only workspaces (YouTube, Insights, Jovie Work, release
  // plan, merch checkout) must never resolve to an in-app route until a
  // native surface exists. The AASA excludes their paths; this boundary is
  // the in-app backstop that hands stragglers back to Safari.
  @Test func webOnlyWorkspaceURLsNeverRouteInApp() {
    let webOnly = [
      "https://jov.ie/app/youtube",
      "https://jov.ie/app/youtube/experiments",
      "https://jov.ie/app/insights",
      "https://jov.ie/app/insights/",
      "https://jov.ie/app/jovie-work",
      "https://jov.ie/app/dashboard/release-plan",
      "https://jov.ie/app/dashboard/insights",
      "ie.jov.jovie://app/youtube",
    ]

    for raw in webOnly {
      let url = URL(string: raw)!
      #expect(
        MobileSignedInLinkRoute.resolve(url) == nil,
        "\(raw) must not resolve to an iOS surface"
      )
      #expect(
        MobileWebOnlyRouteBoundary.isWebOnly(url),
        "\(raw) must hit the web-only boundary"
      )
    }

    // Lookalike prefixes are not web-only: /app/youtube-foo stays unmatched.
    let lookalike = URL(string: "https://jov.ie/app/youtube-foo")!
    #expect(MobileWebOnlyRouteBoundary.isWebOnly(lookalike) == false)

    // Shipped routes still route in-app.
    let settings = URL(string: "https://jov.ie/app/settings")!
    #expect(MobileWebOnlyRouteBoundary.isWebOnly(settings) == false)
    #expect(MobileSignedInLinkRoute.resolve(settings) == .settings)
  }

  @Test func webOnlyFallbackRebasesOntoWebHost() {
    let webBaseURL = URL(string: "https://jov.ie")!
    let url = URL(string: "ie.jov.jovie://app/jovie-work?tab=queue")!
    let fallback = MobileWebOnlyRouteBoundary.webFallbackURL(
      for: url, webBaseURL: webBaseURL
    )
    #expect(fallback.scheme == "https")
    #expect(fallback.host == "jov.ie")
    #expect(fallback.path == "/app/jovie-work")
    #expect(fallback.query == "tab=queue")
  }

  @Test func consumedRequestDoesNotApplyTwice() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .sendMessage(text: "launch my single", autoSend: true)
    )

    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      state: &state
    )
    state.selectedTab = .profile
    state.chatDraft = ""
    state.autoSendMessage = nil

    #expect(
      AppShellIntentNavigation.applyPendingRequest(
        chatEnabled: true,
        state: &state
      ) == false
    )
    #expect(state.selectedTab == .profile)
    #expect(state.chatDraft == "")
  }
}

private func eyesFreeState(
  _ destination: EyesFreeCaptureDestination,
  spokenText: String?
) -> AppShellIntentNavigationState {
  AppShellIntentNavigationState(
    selectedTab: .profile,
    chatDraft: "",
    autoSendMessage: nil,
    openConversationID: nil,
    pendingRequest: .startEyesFreeCapture(
      EyesFreeCaptureLaunch(
        destination: destination,
        spokenText: spokenText,
        idempotencyKey: "turn_\(destination.rawValue)"
      )
    )
  )
}
