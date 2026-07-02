import Foundation
import Observation

/// A navigation request raised by an App Intent (Siri / Shortcuts / Spotlight).
///
/// Intents run in a separate execution context from the SwiftUI scene, so they
/// cannot mutate the shell directly. They enqueue a request here; the running
/// shell observes ``IntentNavigationStore/shared`` and consumes it when it can.
enum IntentNavigationRequest: Equatable, Sendable {
  /// Open the chat surface.
  case openChat
  /// Open chat with the given text. When `autoSend` is true, dispatch the turn immediately.
  case sendMessage(text: String, autoSend: Bool)
  /// Open chat and resume the most recent conversation.
  case continueLastConversation
  /// Open chat and load a specific conversation (Spotlight / Siri Suggestions).
  case openConversation(String)
}

@MainActor
@Observable
final class IntentNavigationStore {
  static let shared = IntentNavigationStore()

  /// The pending request, if any. Set by intents, cleared by ``consume()``.
  private(set) var pending: IntentNavigationRequest?

  init() {}

  func submit(_ request: IntentNavigationRequest) {
    pending = request
  }

  /// Returns and clears the pending request so it is applied exactly once.
  @discardableResult
  func consume() -> IntentNavigationRequest? {
    let value = pending
    pending = nil
    return value
  }
}
