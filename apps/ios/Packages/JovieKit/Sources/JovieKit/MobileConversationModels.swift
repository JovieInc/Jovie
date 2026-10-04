import Foundation

public struct MobileConversationSummary: Codable, Equatable, Identifiable, Sendable {
  public let id: String
  public let title: String?
  public let createdAt: String
  public let updatedAt: String
  public let latestMessageRole: String?
  public let latestTurnStatus: String?

  public init(
    id: String,
    title: String?,
    createdAt: String,
    updatedAt: String,
    latestMessageRole: String?,
    latestTurnStatus: String?
  ) {
    self.id = id
    self.title = title
    self.createdAt = createdAt
    self.updatedAt = updatedAt
    self.latestMessageRole = latestMessageRole
    self.latestTurnStatus = latestTurnStatus
  }
}

public struct MobileConversationListResponse: Codable, Equatable, Sendable {
  public let conversations: [MobileConversationSummary]

  public init(conversations: [MobileConversationSummary]) {
    self.conversations = conversations
  }
}

public struct MobileConversationDetailResponse: Codable, Equatable, Sendable {
  public let conversation: MobileConversationRecord
  public let messages: [MobileConversationMessage]
  public let hasMore: Bool

  public init(
    conversation: MobileConversationRecord,
    messages: [MobileConversationMessage],
    hasMore: Bool
  ) {
    self.conversation = conversation
    self.messages = messages
    self.hasMore = hasMore
  }
}

public struct MobileConversationRecord: Codable, Equatable, Sendable {
  public let id: String
  public let title: String?
  public let createdAt: String
  public let updatedAt: String

  public init(id: String, title: String?, createdAt: String, updatedAt: String) {
    self.id = id
    self.title = title
    self.createdAt = createdAt
    self.updatedAt = updatedAt
  }
}

public struct MobileConversationMessage: Codable, Equatable, Identifiable, Sendable {
  public let id: String
  public let role: String
  public let content: String
  public let clientMessageId: String?
  public let turnId: String?
  public let turnStatus: String?
  public let createdAt: String
  public let requiresWebHandoff: Bool

  public init(
    id: String,
    role: String,
    content: String,
    clientMessageId: String?,
    turnId: String?,
    turnStatus: String?,
    createdAt: String,
    requiresWebHandoff: Bool
  ) {
    self.id = id
    self.role = role
    self.content = content
    self.clientMessageId = clientMessageId
    self.turnId = turnId
    self.turnStatus = turnStatus
    self.createdAt = createdAt
    self.requiresWebHandoff = requiresWebHandoff
  }
}

public struct MobileChatTurnRequest: Encodable, Sendable {
  public let conversationId: String?
  public let clientTurnId: String
  public let clientMessageId: String
  public let text: String
  public let source: String
  public let chatMode: String?

  public init(
    conversationId: String?,
    clientTurnId: String,
    clientMessageId: String,
    text: String,
    source: String,
    chatMode: String? = nil
  ) {
    self.conversationId = conversationId
    self.clientTurnId = clientTurnId
    self.clientMessageId = clientMessageId
    self.text = text
    self.source = source
    self.chatMode = chatMode
  }

  enum CodingKeys: String, CodingKey {
    case conversationId
    case clientTurnId
    case clientMessageId
    case text
    case source
    case chatMode
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encodeIfPresent(conversationId, forKey: .conversationId)
    try container.encode(clientTurnId, forKey: .clientTurnId)
    try container.encode(clientMessageId, forKey: .clientMessageId)
    try container.encode(text, forKey: .text)
    try container.encode(source, forKey: .source)
    try container.encodeIfPresent(chatMode, forKey: .chatMode)
  }
}
