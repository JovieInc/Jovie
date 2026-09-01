import Foundation

enum FrequentActionExceptionReason: String, CaseIterable, Equatable, Sendable {
  case review
  case safety
  case ambiguity
  case irreversibleImpact
  case recovery
}

struct FrequentActionException: Equatable, Sendable {
  let reason: FrequentActionExceptionReason
  /// Visible or documented product copy explaining why the extra step exists.
  let explanation: String
}

struct FrequentActionInteractionContract: Equatable, Sendable {
  let id: String
  let deliberateActivationCount: Int
  let completesOnFinalActivation: Bool
  let exception: FrequentActionException?

  var satisfiesBudget: Bool {
    guard deliberateActivationCount > 0, completesOnFinalActivation else { return false }
    guard deliberateActivationCount > FrequentActionInteractionBudget.maximumActivations else {
      return true
    }
    guard let exception else { return false }
    return !exception.explanation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
}

enum FrequentActionInteractionBudget {
  static let maximumActivations = 2

  static let inAppVoiceSubmit = FrequentActionInteractionContract(
    id: "ios.chat.voice-submit",
    deliberateActivationCount: 2,
    completesOnFinalActivation: true,
    exception: nil
  )

  static let shortcutVoiceSubmit = FrequentActionInteractionContract(
    id: "ios.shortcut.voice-submit",
    deliberateActivationCount: 2,
    completesOnFinalActivation: true,
    exception: nil
  )

  static let registeredContracts = [
    inAppVoiceSubmit,
    shortcutVoiceSubmit,
  ]

  static var violations: [FrequentActionInteractionContract] {
    let duplicateIDs = Set(
      Dictionary(grouping: registeredContracts, by: \.id)
        .filter { $0.value.count > 1 }
        .keys
    )
    return registeredContracts.filter {
      !$0.satisfiesBudget || duplicateIDs.contains($0.id)
    }
  }
}

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

    if isOffline {
      switch request {
      case .startVoiceCapture, .startEyesFreeCapture:
        state.unavailableMessage = EyesFreeCaptureGate.offlineMessage
        return true
      default:
        break
      }
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
    state.talkAutoSubmit = FrequentActionInteractionBudget.shortcutVoiceSubmit
      .completesOnFinalActivation
    let spoken = VoiceMemoActionDraft.make(fromTranscript: launch.spokenText ?? "")
    if VoiceMemoActionDraft.isReady(spoken) {
      state.autoSendMessage = spoken
    } else {
      state.shouldStartVoiceCapture = true
    }
  }
}
