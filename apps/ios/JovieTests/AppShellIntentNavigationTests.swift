import Foundation
import Testing
@testable import Jovie

struct AppShellIntentNavigationTests {
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
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .startEyesFreeCapture(
        EyesFreeCaptureLaunch(
          destination: .summer,
          spokenText: "what is blocked",
          idempotencyKey: "turn_summer_1"
        )
      )
    )

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
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .startEyesFreeCapture(
        EyesFreeCaptureLaunch(
          destination: .summer,
          spokenText: "park the teardown",
          idempotencyKey: "turn_summer_2"
        )
      )
    )

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
    var state = AppShellIntentNavigationState(
      selectedTab: .chat,
      chatDraft: "",
      autoSendMessage: nil,
      openConversationID: nil,
      pendingRequest: .startEyesFreeCapture(
        EyesFreeCaptureLaunch(
          destination: .jovie,
          spokenText: nil,
          idempotencyKey: "turn_offline_1"
        )
      )
    )

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
