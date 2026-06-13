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
  let requiresWebHandoff: Bool
  let handoffURL: URL?
}

struct CachedChatSnapshot: Codable, Equatable, Sendable {
  let conversations: [MobileConversationSummary]
  let messagesByConversationID: [String: [MobileConversationMessage]]
  let cachedAt: Date
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