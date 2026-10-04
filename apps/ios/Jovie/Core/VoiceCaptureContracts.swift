import Foundation

enum VoiceCaptureError: LocalizedError, Equatable {
  case microphoneDenied
  case speechDenied
  case recognizerUnavailable
  case audioUnavailable
  case emptyTranscript
  case notRecording

  var errorDescription: String? {
    switch self {
    case .microphoneDenied:
      "Microphone access is off. Enable it in Settings → Jovie."
    case .speechDenied:
      "Speech recognition is off. Enable it in Settings → Jovie."
    case .recognizerUnavailable:
      "Voice is unavailable on this device."
    case .audioUnavailable:
      "The microphone isn't available right now. Try again."
    case .emptyTranscript:
      "Nothing heard."
    case .notRecording:
      "Voice is not recording."
    }
  }
}

enum EyesFreeCaptureGate: Equatable {
  case ready
  case unavailable
  case offline
  case unsigned
  case summerForbidden
  case permission
  case transcriptionEmpty
  case uploadFailed

  static let unavailableMessage = "Capture is unavailable."
  static let offlineMessage = "You're offline. Retry when you are back."
  static let summerForbiddenMessage = "Summer is only available to the founder."
  static let retryMessage = "Retry this capture from Jovie."

  static func resolve(
    isSignedIn: Bool,
    chatEnabled: Bool,
    isOffline: Bool,
    destination: EyesFreeCaptureDestination,
    canUseSummer: Bool
  ) -> Self {
    if !isSignedIn { return .unsigned }
    if !chatEnabled { return .unavailable }
    if isOffline { return .offline }
    if destination == .summer, !canUseSummer { return .summerForbidden }
    return .ready
  }

  var message: String {
    switch self {
    case .ready: ""
    case .unavailable, .unsigned: Self.unavailableMessage
    case .offline: Self.offlineMessage
    case .summerForbidden: Self.summerForbiddenMessage
    case .permission:
      VoiceCaptureError.microphoneDenied.errorDescription ?? Self.unavailableMessage
    case .transcriptionEmpty:
      VoiceCaptureError.emptyTranscript.errorDescription ?? "Nothing heard."
    case .uploadFailed: Self.retryMessage
    }
  }
}

enum VoiceMemoActionDraft: Equatable {
  /// Shell handoff outcome for a recovered voice memo (never auto-sends).
  struct ShellHandoff: Equatable {
    let chatDraft: String
    /// Recovery requires a new explicit send from the composer.
    let autoSendMessage: String?
  }

  /// Normalize spoken text for direct submission or recovery.
  static func make(fromTranscript transcript: String) -> String {
    transcript.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// Whether normalized text is ready to submit or preserve.
  static func isReady(_ draft: String) -> Bool {
    !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// Failed Talk completion → AppShell recovery contract.
  static func shellHandoff(fromTranscript transcript: String) -> ShellHandoff {
    ShellHandoff(
      chatDraft: make(fromTranscript: transcript),
      autoSendMessage: nil
    )
  }
}
