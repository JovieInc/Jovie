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
/// Resolves optional thumbnail URLs for inline entity chips (GH-12708 v2).
/// Mirrors the web `EntityResolutionProvider` cache-only contract: degrade to
/// accent-dot fallback when no artwork is known. Fixture IDs used by
/// `MobileChatEntityFixture` map to stable placeholder URLs so UI tests can
/// exercise the thumbnail slot without a live discography cache on iOS yet.
enum MobileChatEntityThumbnailResolver {
  private static let fixtureThumbnails: [String: URL] = [
    "release:rel_1": URL(string: "https://cdn.example/ios-fixture/rel_1.jpg")!,
    "artist:art_1": URL(string: "https://cdn.example/ios-fixture/art_1.jpg")!,
    "track:trk_1": URL(string: "https://cdn.example/ios-fixture/trk_1.jpg")!,
  ]

  static func thumbnailURL(kind: MobileChatEntityKind, id: String) -> URL? {
    fixtureThumbnails["\(kind.rawValue):\(id)"]
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

/// Deterministic fixture timeline for `.uiTestingChatAllComponents`.
/// Content is raw wire markup so the shipped `MobileChatContentParser`
/// produces tool cards, merch artifacts, video proposals, and chips.
/// Empty-state and offline-placeholder stay on their dedicated launch modes.
enum MobileChatAllComponentsFixture {
  static let conversationID = "conv_ui_testing_all_components"

  static let userProse = "What's next for @artist:art_1[Porter Robinson]?"

  static let assistantProse = """
  Your release @release:rel_1[Midnight Drive] is picking up momentum, and \
  @track:trk_1[Opus] is the standout. Consider /skill:generateAlbumArt for \
  the next drop, and don't miss @event:evt_1[Coachella 2027].
  """

  static let runningToolCall =
    "<tool_call><name>createMerch</name><parameters><artistName>Tim White</artistName><artistGenres>pop, electronic</artistGenres><releaseContext>All This Noise EP and remixes</releaseContext></parameters></tool_call>"

  static let failedToolCall = """
  <tool_call><name>createMerch</name><parameters><artistName>Tim White</artistName></parameters></tool_call>
  <tool_result><name>createMerch</name><state>failed</state><message>Denied by user</message></tool_result>
  """

  static let merchProductOptionsJSON =
    #"{"success":true,"generationId":"gen-1","options":[{"id":"opt-1","option_number":1,"design_name":"Neon Pulse Tee","product_type":"Tee","concept":"Bold neon typography.","mockup_urls":["https://cdn.test/neon.jpg"],"price_recommendation":{"sale_price":"$45.00"}}]}"#

  static var merchProductOptions: String {
    """
    **1. Neon Pulse Tee** — bold neon typography.
    <tool_call><name>createMerch</name><parameters></parameters></tool_call>
    <tool_result><name>createMerch</name><state>success</state><json>\(merchProductOptionsJSON)</json></tool_result>
    """
  }

  static let merchDesignCarousel =
    #"<tool_call><name>previewMerchOptions</name><parameters></parameters></tool_call><tool_result><name>previewMerchOptions</name><state>success</state><json>{"success":true,"generationId":"gen-2","designs":[{"id":"d-1","option_number":1,"design_name":"Mono Mark","concept":"Minimal line art.","status":"ready","preview_url":"https://cdn.test/mono.png"}]}</json></tool_result>"#

  static let videoProposal =
    #"<tool_call><name>proposeVideoRecording</name><parameters></parameters></tool_call><tool_result><name>proposeVideoRecording</name><state>success</state><json>{"success":true,"kind":"promo","title":"Release day shout-out","script":"Hey, my new single is out today.","showcaseVariant":"direct","label":"Promo video"}</json></tool_result>"#

  static let retryProse = "That last request didn't go through."

  static let webHandoffProse = "Finish the remaining steps on the web."

  static let `default`: [MobileChatTimelineItem] = [
    MobileChatTimelineItem(
      id: "msg_all_user_1",
      role: .user,
      content: userProse,
      status: .completed,
      clientTurnId: "turn_all_prose",
      requiresWebHandoff: false,
      handoffURL: nil
    ),
    MobileChatTimelineItem(
      id: "msg_all_assistant_1",
      role: .assistant,
      content: assistantProse,
      status: .completed,
      clientTurnId: "turn_all_prose",
      requiresWebHandoff: false,
      handoffURL: nil
    ),
    MobileChatTimelineItem(
      id: "msg_all_thinking",
      role: .assistant,
      content: "",
      status: .streaming,
      clientTurnId: "turn_all_thinking",
      requiresWebHandoff: false,
      handoffURL: nil
    ),
    MobileChatTimelineItem(
      id: "msg_all_tool_running",
      role: .assistant,
      content: runningToolCall,
      status: .completed,
      clientTurnId: "turn_all_tool_running",
      requiresWebHandoff: false,
      handoffURL: nil
    ),
    MobileChatTimelineItem(
      id: "msg_all_tool_failed",
      role: .assistant,
      content: failedToolCall,
      status: .completed,
      clientTurnId: "turn_all_tool_failed",
      requiresWebHandoff: false,
      handoffURL: nil
    ),
    MobileChatTimelineItem(
      id: "msg_all_retry",
      role: .assistant,
      content: retryProse,
      status: .failed,
      clientTurnId: "turn_all_retry",
      requiresWebHandoff: false,
      handoffURL: nil
    ),
    MobileChatTimelineItem(
      id: "msg_all_handoff",
      role: .assistant,
      content: webHandoffProse,
      status: .completed,
      clientTurnId: "turn_all_handoff",
      requiresWebHandoff: true,
      handoffURL: URL(string: "https://jov.ie/app")
    ),
    MobileChatTimelineItem(
      id: "msg_all_merch_options",
      role: .assistant,
      content: merchProductOptions,
      status: .completed,
      clientTurnId: "turn_all_merch_options",
      requiresWebHandoff: false,
      handoffURL: nil
    ),
    MobileChatTimelineItem(
      id: "msg_all_merch_carousel",
      role: .assistant,
      content: merchDesignCarousel,
      status: .completed,
      clientTurnId: "turn_all_merch_carousel",
      requiresWebHandoff: false,
      handoffURL: nil
    ),
    MobileChatTimelineItem(
      id: "msg_all_video",
      role: .assistant,
      content: videoProposal,
      status: .completed,
      clientTurnId: "turn_all_video",
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
  let chatMode: String?

  init(
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

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encodeIfPresent(conversationId, forKey: .conversationId)
    try container.encode(clientTurnId, forKey: .clientTurnId)
    try container.encode(clientMessageId, forKey: .clientMessageId)
    try container.encode(text, forKey: .text)
    try container.encode(source, forKey: .source)
    try container.encodeIfPresent(chatMode, forKey: .chatMode)
  }
}

struct EyesFreeCaptureAPIRequest: Encodable, Sendable {
  let destination: String
  let transcript: String
  let clientTurnId: String
  let clientMessageId: String
}

struct EyesFreeCaptureAPIResponse: Decodable, Equatable, Sendable {
  let destination: String
  let status: String
  let conversationId: String?
  let turnId: String?
  let readback: String
  let errorCode: String?
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