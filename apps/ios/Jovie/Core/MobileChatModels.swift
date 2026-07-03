import Foundation

struct MobileConversationSummary: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let title: String?
  let createdAt: String
  let updatedAt: String
  let latestMessageRole: String?
  let latestTurnStatus: String?
}

struct MobileConversationListResponse: Codable, Equatable, Sendable {
  let conversations: [MobileConversationSummary]
}

struct MobileConversationDetailResponse: Codable, Equatable, Sendable {
  let conversation: MobileConversationRecord
  let messages: [MobileConversationMessage]
  let hasMore: Bool
}

struct MobileConversationRecord: Codable, Equatable, Sendable {
  let id: String
  let title: String?
  let createdAt: String
  let updatedAt: String
}

struct MobileConversationMessage: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let role: String
  let content: String
  let clientMessageId: String?
  let turnId: String?
  let turnStatus: String?
  let createdAt: String
  let requiresWebHandoff: Bool
}

enum MobileChatTimelineRole: String, Equatable, Sendable {
  case user
  case assistant
  case system
}

enum MobileChatTimelineStatus: Equatable, Sendable {
  case idle
  case sending
  case streaming
  case failed
  case completed
}

struct MobileChatTimelineItem: Identifiable, Equatable, Sendable {
  let id: String
  let role: MobileChatTimelineRole
  var content: String
  var status: MobileChatTimelineStatus
  let clientTurnId: String?
  var requiresWebHandoff: Bool
  var handoffURL: URL?
}

struct CachedChatSnapshot: Codable, Equatable, Sendable {
  let conversations: [MobileConversationSummary]
  let messagesByConversationID: [String: [MobileConversationMessage]]
  let cachedAt: Date
}

/// Deterministic fixture timeline used only by `.uiTestingChatEntityFixture`
/// (JOV-3608). Exercises entity mentions (all four kinds), a skill
/// invocation, and a user-authored turn containing a mention, so UI tests can
/// assert chips render as label text with no raw `@kind:id[...]` / `/skill:`
/// wire syntax visible -- the JOV-3608 regression symptom.
/// Stable artwork URLs for the UI-testing entity fixture. Production chat
/// degrades to accent-dot chips until a profile-scoped entity cache lands.
enum MobileChatEntityFixtureThumbnailRegistry {
  private static let urls: [String: URL] = [
    "release:rel_1": URL(string: "https://picsum.photos/seed/jovie-rel-1/64/64")!,
    "artist:art_1": URL(string: "https://picsum.photos/seed/jovie-art-1/64/64")!,
    "track:trk_1": URL(string: "https://picsum.photos/seed/jovie-trk-1/64/64")!,
    "event:evt_1": URL(string: "https://picsum.photos/seed/jovie-evt-1/64/64")!,
  ]

  static func thumbnailURL(kind: MobileChatEntityKind, id: String) -> URL? {
    urls["\(kind.rawValue):\(id)"]
  }
}

enum MobileChatEntityFixture {
  static let conversationID = "conv_ui_testing_entity_fixture"

  static let `default`: [MobileChatTimelineItem] = [
    MobileChatTimelineItem(
      id: "msg_fixture_user_1",
      role: .user,
      content: "What's next for @artist:art_1[Porter Robinson]?",
      status: .completed,
      clientTurnId: "turn_fixture_1",
      requiresWebHandoff: false,
      handoffURL: nil
    ),
    MobileChatTimelineItem(
      id: "msg_fixture_assistant_1",
      role: .assistant,
      content: """
      Your release @release:rel_1[Midnight Drive] is picking up momentum, and \
      @track:trk_1[Opus] is the standout. Consider /skill:generateAlbumArt for \
      the next drop, and don't miss @event:evt_1[Coachella 2027].
      """,
      status: .completed,
      clientTurnId: "turn_fixture_1",
      requiresWebHandoff: false,
      handoffURL: nil
    ),
  ]
}

struct MobileChatTurnRequest: Encodable, Sendable {
  let conversationId: String?
  let clientTurnId: String
  let clientMessageId: String
  let text: String
  let source: String
}

enum MobileChatStreamEvent: Equatable, Sendable {
  case turnReserved(conversationId: String, turnId: String, clientTurnId: String)
  case assistantDelta(clientTurnId: String, text: String)
  case assistantCompleted(
    clientTurnId: String,
    conversationId: String,
    turnId: String,
    text: String
  )
  case webHandoff(clientTurnId: String, conversationId: String, url: URL, summary: String)
  case error(code: String, message: String)
}

enum MobileChatClientError: Error, Equatable, LocalizedError {
  case decodingFailed
  case invalidResponse
  case requestFailed(statusCode: Int)
  case transportFailed(code: Int)
  case streamFailed(message: String)

  var errorDescription: String? {
    switch self {
    case .decodingFailed:
      return "The chat response could not be decoded."
    case .invalidResponse:
      return "The chat server returned an invalid response."
    case let .requestFailed(statusCode):
      return "The chat request failed with status code \(statusCode)."
    case let .transportFailed(code):
      return "The chat network request failed with code \(code)."
    case let .streamFailed(message):
      return message
    }
  }
}