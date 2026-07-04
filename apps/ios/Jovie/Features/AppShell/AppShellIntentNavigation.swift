import Foundation

struct AppShellIntentNavigationState: Equatable {
  var selectedTab: AppShellTab
  var chatDraft: String
  var autoSendMessage: String?
  var shouldStartVoiceCapture = false
  var openConversationID: String?
  var pendingRequest: IntentNavigationRequest?
}

enum AppShellIntentNavigation {
  @discardableResult
  static func applyPendingRequest(
    chatEnabled: Bool,
    state: inout AppShellIntentNavigationState
  ) -> Bool {
    guard let request = state.pendingRequest else { return false }
    state.pendingRequest = nil

    guard chatEnabled else { return true }

    switch request {
    case .openChat, .continueLastConversation:
      state.selectedTab = .chat
    case .startVoiceCapture:
      state.selectedTab = .chat
      state.shouldStartVoiceCapture = true
    case let .sendMessage(text, autoSend):
      state.selectedTab = .chat
      if autoSend {
        state.autoSendMessage = text
        state.chatDraft = ""
      } else {
        state.chatDraft = text
      }
    case let .openConversation(conversationID):
      state.selectedTab = .chat
      state.openConversationID = conversationID
    }

    return true
  }
}
