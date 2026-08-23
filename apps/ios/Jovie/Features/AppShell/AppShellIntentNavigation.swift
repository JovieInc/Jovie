import Foundation

struct AppShellIntentNavigationState: Equatable {
  var selectedTab: AppShellTab
  var chatDraft: String
  var autoSendMessage: String?
  var shouldStartVoiceCapture = false
  var shouldOpenSettings = false
  var openConversationID: String?
  var pendingRequest: IntentNavigationRequest?
}

enum MobileSignedInLinkRoute: String, Equatable, Sendable {
  case settings
  case chatHome

  var intent: IntentNavigationRequest {
    switch self {
    case .settings: return .openSettings
    case .chatHome: return .openChat
    }
  }

  /// Signed-in product URLs. Auth callbacks stay on the existing parser.
  static func resolve(_ url: URL) -> Self? {
    let path = normalizedPath(url.path)
    if path == "/settings" || path.hasPrefix("/settings/")
      || path == "/app/settings" || path.hasPrefix("/app/settings/")
    {
      return .settings
    }
    // Signed-in /start stays on Chat. Do not reopen auth.
    if path == "/start" || path == "/app/start" {
      return .chatHome
    }
    return nil
  }

  private static func normalizedPath(_ path: String) -> String {
    let lowered = path.lowercased()
    if lowered.count > 1, lowered.hasSuffix("/") {
      return String(lowered.dropLast())
    }
    return lowered
  }
}

enum AppShellIntentNavigation {
  @discardableResult
  static func applyPendingRequest(
    chatEnabled: Bool,
    state: inout AppShellIntentNavigationState
  ) -> Bool {
    guard let request = state.pendingRequest else { return false }
    state.pendingRequest = nil

    if case .openSettings = request {
      state.shouldOpenSettings = true
      return true
    }

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
    case .openSettings:
      state.shouldOpenSettings = true
    }

    return true
  }
}
