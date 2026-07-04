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
    #expect(state.pendingRequest == nil)
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
    #expect(state.pendingRequest == nil)
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
