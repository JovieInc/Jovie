import JovieKit

/// Explicit local development modes only. Live product ownership remains in the shared client workstream.
enum MacDevelopmentContent: Equatable {
  case unavailable
  #if DEBUG
  case fixture(MobileConversationSummary, [MobileConversationMessage])
  case localDraft
  #endif

  static func resolve(arguments: [String]) -> Self {
    #if DEBUG
    if arguments.contains("--jovie-development-composer") {
      return .localDraft
    }
    if arguments.contains("--jovie-development-fixture") {
      return .fixture(
        MobileConversationSummary(
          id: "development-conversation",
          title: "Shared native foundations",
          createdAt: "2026-10-02T00:00:00Z",
          updatedAt: "2026-10-02T00:00:00Z",
          latestMessageRole: "assistant",
          latestTurnStatus: "completed"
        ),
        [
          MobileConversationMessage(
            id: "development-message",
            role: "assistant",
            content: "This read-only fixture uses the shared conversation models and Jovie theme.",
            clientMessageId: nil,
            turnId: nil,
            turnStatus: "completed",
            createdAt: "2026-10-02T00:00:00Z",
            requiresWebHandoff: false
          )
        ]
      )
    }
    #endif
    return .unavailable
  }
}
