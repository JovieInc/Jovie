import Foundation
import JovieKit

/// Honest post-Identity chat stages for TTMV observation (JOV-13858).
/// Screen view is never activation. Cancel is never fail. Live launch only.
enum PostIdentityChatMeasurement {
  enum StageBit: String {
    /// Armed only when Identity first-value is newly marked this install era.
    case measurementArmed = "measurementArmed"
    case emptyHomeSeen = "emptyHomeSeen"
    case firstSendStarted = "firstSendStarted"
    case firstSendCancelled = "firstSendCancelled"
    case firstSendFailed = "firstSendFailed"
    case firstSendSucceeded = "firstSendSucceeded"
    case emptyHomeDwell = "emptyHomeDwell"
  }

  enum FirstSendOutcome: String {
    case succeeded
    case cancelled
    case failed
  }

  /// Decision for a stream that finished without throwing (NDJSON terminal state).
  struct StreamTerminalDecision: Equatable {
    let outcome: FirstSendOutcome
    let failureReason: String?
    let clearLastError: Bool
  }

  static let storageKeyPrefix = "jovie.postIdentity.chat."
  /// Empty-home dwell window before emitting a one-shot stall breadcrumb.
  static let emptyHomeDwellSeconds: Duration = .seconds(30)

  /// Map post-stream assistant state to a first-send outcome.
  /// Stream `.failed` / `.canceled` do not throw — callers must still emit here.
  static func decideStreamTerminal(
    missingTerminalState: Bool,
    isFailed: Bool,
    isCanceled: Bool
  ) -> StreamTerminalDecision {
    if missingTerminalState {
      return StreamTerminalDecision(
        outcome: .failed,
        failureReason: "missing_terminal_state",
        clearLastError: false
      )
    }
    if isFailed {
      return StreamTerminalDecision(
        outcome: .failed,
        failureReason: "stream_failed",
        clearLastError: false
      )
    }
    if isCanceled {
      return StreamTerminalDecision(
        outcome: .cancelled,
        failureReason: nil,
        clearLastError: false
      )
    }
    return StreamTerminalDecision(
      outcome: .succeeded,
      failureReason: nil,
      clearLastError: true
    )
  }

  private static var defaultsOverride: UserDefaults?

  static var defaults: UserDefaults {
    defaultsOverride ?? .standard
  }

  @discardableResult
  static func replaceDefaultsForTesting(_ defaults: UserDefaults?) -> UserDefaults? {
    let previous = defaultsOverride
    defaultsOverride = defaults
    return previous
  }

  static func storageKey(bit: StageBit, userID: String) -> String {
    storageKeyPrefix + bit.rawValue + "." + userID
  }

  static func hasEmitted(
    bit: StageBit,
    userID: String?,
    defaults: UserDefaults = PostIdentityChatMeasurement.defaults
  ) -> Bool {
    guard let userID, !userID.isEmpty else { return true }
    return defaults.bool(forKey: storageKey(bit: bit, userID: userID))
  }

  static func markEmitted(
    bit: StageBit,
    userID: String?,
    defaults: UserDefaults = PostIdentityChatMeasurement.defaults
  ) {
    guard let userID, !userID.isEmpty else { return }
    defaults.set(true, forKey: storageKey(bit: bit, userID: userID))
  }

  /// Live cohort armed at Identity land that has not succeeded a first send yet.
  /// Pre-existing Identity bits without arming (upgrade) are not customers in this funnel.
  static func isEligible(
    userID: String?,
    launchMode: LaunchMode,
    isFixtureSeeded: Bool = false
  ) -> Bool {
    guard launchMode == .live, !isFixtureSeeded else { return false }
    guard let userID, !userID.isEmpty else { return false }
    guard FirstValueLandingPolicy.hasPresentedIdentityFirstValue(userID: userID) else {
      return false
    }
    guard hasEmitted(bit: .measurementArmed, userID: userID) else { return false }
    return !hasEmitted(bit: .firstSendSucceeded, userID: userID)
  }

  /// Identity land is the funnel denominator. Not chat activation.
  static func noteIdentityFirstValueSeen(userID: String?, launchMode: LaunchMode) {
    guard launchMode == .live, let userID, !userID.isEmpty else { return }
    markEmitted(bit: .measurementArmed, userID: userID)
    Observability.addBreadcrumb(
      .identityFirstValueSeen,
      context: ["stage": "identity_landed"]
    )
  }

  /// Empty chat tab visible after Identity. Stage only — not activation.
  @discardableResult
  static func noteEmptyChatHomeSeen(
    userID: String?,
    launchMode: LaunchMode,
    isEmpty: Bool,
    isChatSurfaceVisible: Bool,
    isFixtureSeeded: Bool = false
  ) -> Bool {
    guard isEmpty, isChatSurfaceVisible else { return false }
    guard isEligible(userID: userID, launchMode: launchMode, isFixtureSeeded: isFixtureSeeded)
    else { return false }
    guard !hasEmitted(bit: .emptyHomeSeen, userID: userID) else { return false }
    markEmitted(bit: .emptyHomeSeen, userID: userID)
    Observability.addBreadcrumb(
      .chatEmptyHomeSeen,
      context: ["stage": "empty_home_visible"]
    )
    return true
  }

  /// One-shot dwell after empty home without a started send. Not a failure.
  @discardableResult
  static func noteEmptyChatHomeDwell(
    userID: String?,
    launchMode: LaunchMode,
    isEmpty: Bool,
    isChatSurfaceVisible: Bool,
    isFixtureSeeded: Bool = false
  ) -> Bool {
    guard isEmpty, isChatSurfaceVisible else { return false }
    guard isEligible(userID: userID, launchMode: launchMode, isFixtureSeeded: isFixtureSeeded)
    else { return false }
    guard hasEmitted(bit: .emptyHomeSeen, userID: userID) else { return false }
    guard !hasEmitted(bit: .firstSendStarted, userID: userID) else { return false }
    guard !hasEmitted(bit: .emptyHomeDwell, userID: userID) else { return false }
    markEmitted(bit: .emptyHomeDwell, userID: userID)
    Observability.addBreadcrumb(
      .chatEmptyHomeDwell,
      context: [
        "stage": "empty_home_dwell",
        "dwell_seconds": 30,
      ]
    )
    return true
  }

  /// First admitted send after Identity (authorization acquired). No prompt text.
  /// Retries never start the funnel; prior user messages mean this is not first send.
  @discardableResult
  static func noteFirstSendStarted(
    userID: String?,
    launchMode: LaunchMode,
    isFixtureSeeded: Bool = false,
    isRetry: Bool = false,
    hadPriorUserMessages: Bool = false
  ) -> Bool {
    guard !isRetry, !hadPriorUserMessages else { return false }
    guard isEligible(userID: userID, launchMode: launchMode, isFixtureSeeded: isFixtureSeeded)
    else { return false }
    guard !hasEmitted(bit: .firstSendStarted, userID: userID) else { return false }
    markEmitted(bit: .firstSendStarted, userID: userID)
    Observability.addBreadcrumb(
      .chatFirstSendStarted,
      context: ["stage": "send_authorized"]
    )
    return true
  }

  /// Terminal first-send outcome. Cancel never uses the failed event.
  /// Retries may still emit success after an earlier fail/cancel on the same funnel.
  @discardableResult
  static func noteFirstSendOutcome(
    userID: String?,
    launchMode: LaunchMode,
    outcome: FirstSendOutcome,
    isFixtureSeeded: Bool = false,
    failureReason: String? = nil
  ) -> Bool {
    guard isEligible(userID: userID, launchMode: launchMode, isFixtureSeeded: isFixtureSeeded)
    else { return false }
    guard hasEmitted(bit: .firstSendStarted, userID: userID) else { return false }

    switch outcome {
    case .succeeded:
      guard !hasEmitted(bit: .firstSendSucceeded, userID: userID) else { return false }
      markEmitted(bit: .firstSendSucceeded, userID: userID)
      Observability.addBreadcrumb(
        .chatFirstSendSucceeded,
        context: ["stage": "send_completed"]
      )
      return true
    case .cancelled:
      guard !hasEmitted(bit: .firstSendCancelled, userID: userID) else { return false }
      markEmitted(bit: .firstSendCancelled, userID: userID)
      Observability.addBreadcrumb(
        .chatFirstSendCancelled,
        context: ["stage": "send_cancelled", "reason": "user_or_task_cancelled"]
      )
      return true
    case .failed:
      guard !hasEmitted(bit: .firstSendFailed, userID: userID) else { return false }
      markEmitted(bit: .firstSendFailed, userID: userID)
      var context: ObservabilityContext = ["stage": "send_failed"]
      if let failureReason, !failureReason.isEmpty {
        context["reason"] = failureReason
      }
      Observability.addBreadcrumb(.chatFirstSendFailed, level: .warning, context: context)
      return true
    }
  }

  /// Stable machine token — never prompt text or localized error copy.
  static func failureReason(for error: Error) -> String {
    // Checked first: missingToken is also a terminal auth failure but keeps its own token.
    if case APIClientError.missingToken = error {
      return "missing_token"
    }
    if isTerminalChatAuthFailure(error) {
      return "terminal_auth"
    }
    if case let MobileChatClientError.requestFailed(statusCode: code) = error {
      return "http_\(code)"
    }
    if case let APIClientError.requestFailed(statusCode: code) = error {
      return "http_\(code)"
    }
    return "send_failed"
  }
}
