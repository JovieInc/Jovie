import Foundation

struct AppShellIntentNavigationState: Equatable {
  var selectedTab: AppShellTab
  var chatDraft: String
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
    case let .sendMessage(text):
      state.chatDraft = text
      state.selectedTab = .chat
    }

    return true
  }
}
