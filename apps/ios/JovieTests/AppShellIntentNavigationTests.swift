import Testing
@testable import Jovie

struct AppShellIntentNavigationTests {
  @Test func openChatSelectsChatTab() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "",
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

  @Test func sendMessageSelectsChatTabAndPrefillsDraft() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "",
      pendingRequest: .sendMessage("launch my single")
    )

    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      state: &state
    )

    #expect(state.selectedTab == .chat)
    #expect(state.chatDraft == "launch my single")
    #expect(state.pendingRequest == nil)
  }

  @Test func chatDisabledConsumesRequestWithoutLeavingProfile() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "existing draft",
      pendingRequest: .sendMessage("launch my single")
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

  @Test func consumedRequestDoesNotApplyTwice() {
    var state = AppShellIntentNavigationState(
      selectedTab: .profile,
      chatDraft: "",
      pendingRequest: .sendMessage("launch my single")
    )

    AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: true,
      state: &state
    )
    state.selectedTab = .profile
    state.chatDraft = ""

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
