import Foundation

struct AppShellIntentNavigationState: Equatable {
  var selectedTab: AppShellTab
  var chatDraft: String
  var autoSendMessage: String?
  var shouldStartVoiceCapture = false
  var talkAutoSubmit = false
  var eyesFreeLaunch: EyesFreeCaptureLaunch?
  var unavailableMessage: String?
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
    canUseSummer: Bool = false,
    isOffline: Bool = false,
    state: inout AppShellIntentNavigationState
  ) -> Bool {
    guard let request = state.pendingRequest else { return false }
    state.pendingRequest = nil

    if case .openSettings = request {
      state.shouldOpenSettings = true
      return true
    }

    guard chatEnabled else {
      switch request {
      case .startVoiceCapture, .startEyesFreeCapture:
        state.unavailableMessage = EyesFreeCaptureGate.unavailableMessage
      default:
        break
      }
      return true
    }

    if isOffline, isEyesFreeRequest(request) {
      state.unavailableMessage = EyesFreeCaptureGate.offlineMessage
      return true
    }

    switch request {
    case .openChat, .continueLastConversation:
      state.selectedTab = .chat
    case .startVoiceCapture:
      applyEyesFreeLaunch(
        EyesFreeCaptureLaunch(
          destination: .jovie,
          spokenText: nil,
          idempotencyKey: UUID().uuidString
        ),
        canUseSummer: canUseSummer,
        to: &state
      )
    case let .startEyesFreeCapture(launch):
      applyEyesFreeLaunch(launch, canUseSummer: canUseSummer, to: &state)
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

  private static func isEyesFreeRequest(_ request: IntentNavigationRequest) -> Bool {
    switch request {
    case .startVoiceCapture, .startEyesFreeCapture:
      return true
    default:
      return false
    }
  }

  private static func applyEyesFreeLaunch(
    _ launch: EyesFreeCaptureLaunch,
    canUseSummer: Bool,
    to state: inout AppShellIntentNavigationState
  ) {
    let gate = EyesFreeCaptureGate.resolve(
      isSignedIn: true,
      chatEnabled: true,
      isOffline: false,
      destination: launch.destination,
      canUseSummer: canUseSummer
    )
    if gate != .ready {
      state.unavailableMessage = gate.message
      return
    }

    state.selectedTab = .chat
    state.eyesFreeLaunch = launch
    let spoken = VoiceMemoActionDraft.make(fromTranscript: launch.spokenText ?? "")
    if VoiceMemoActionDraft.isReady(spoken) {
      state.autoSendMessage = spoken
      state.talkAutoSubmit = true
    } else {
      state.shouldStartVoiceCapture = true
      state.talkAutoSubmit = true
    }
  }
}
