import Foundation

struct MobileActionLoopInboxItem: Codable, Equatable, Sendable, Identifiable {
  let id: String
  let typeLabel: String
  let createdAt: String
  let title: String
  let why: String
  let primaryActionLabel: String
  let status: String
}

struct MobileActionLoopInboxEmptyActionCard: Codable, Equatable, Sendable, Identifiable {
  let id: String
  let title: String
  let body: String
  let actionLabel: String
  let continueOnWebPath: String
}

struct MobileActionLoopInboxResponse: Codable, Equatable, Sendable {
  let pendingCount: Int
  let items: [MobileActionLoopInboxItem]
  let emptyActionCards: [MobileActionLoopInboxEmptyActionCard]
  let chatPrompt: String

  static let preview = MobileActionLoopInboxResponse(
    pendingCount: 1,
    items: [
      MobileActionLoopInboxItem(
        id: "action-1",
        typeLabel: "Suggestion",
        createdAt: "2026-06-28T10:00:00.000Z",
        title: "Detroit listeners up 340% — book a show",
        why: "Promoter email matched your Detroit growth spike.",
        primaryActionLabel: "Add to calendar",
        status: "pending"
      ),
    ],
    emptyActionCards: [],
    chatPrompt: "Ask Jovie which revenue opportunities I should act on first."
  )
}