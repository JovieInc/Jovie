import Foundation
import JovieKit

enum MobileChatTimelineRole: String, Equatable, Sendable {
  case user
  case assistant
  case system
}

enum MobileChatTimelineStatus: Equatable, Sendable {
  case idle
  case sending
  case queued
  case running
  case retrying
  case streaming
  case failed
  case canceled
  case completed

  var isInFlight: Bool {
    switch self {
    case .sending, .queued, .running, .retrying, .streaming:
      return true
    case .idle, .failed, .canceled, .completed:
      return false
    }
  }
}

struct MobileChatTimelineItem: Identifiable, Equatable, Sendable {
  let id: String
  let role: MobileChatTimelineRole
  var content: String
  var status: MobileChatTimelineStatus
  let clientTurnId: String?
  var requiresWebHandoff: Bool
  var handoffURL: URL?
  var turnId: String? = nil
  var eveWorkId: String? = nil
  /// Server timestamp (ISO-8601) for fetched messages, stamped once at append
  /// for local turns. Persisted through the cache round-trip in `persistCache`
  /// so the load-earlier cursor still points at older history after an app
  /// restart; `nil` only for locally composed rows with no server row yet
  /// (JOV-6210).
  var createdAt: String? = nil
}

struct CachedChatSnapshot: Codable, Equatable, Sendable {
  let conversations: [MobileConversationSummary]
  let messagesByConversationID: [String: [MobileConversationMessage]]
  let cachedAt: Date
  var activeConversationID: String? = nil
  /// Optional so snapshots written before this field existed still decode.
  /// Without it, a restarted session could never offer load-earlier for a
  /// cached window at or under the fetch limit (JOV-6210).
  var hasMoreOlderByConversationID: [String: Bool]? = nil
}

/// Newest-first transcript window. Numbers match `CHAT_TRANSCRIPT_WINDOW`
/// in `apps/web/lib/chat/transcript-window.ts` (JOV-5874 / JOV-5044).
enum ChatTranscriptWindow {
  static let virtualizeAfterMessageCount = 8
  static let overscanRowCount = 5
  static let initialMessageLimit = 40

  /// Hard cap on messages persisted per conversation (JOV-5144). The
  /// persisted snapshot is re-encoded whole on every turn and loaded into
  /// memory at launch, so an unbounded history grows resident RAM without
  /// limit and can trip the Jetsam watchdog. Older rows stay available via
  /// load-earlier (`before` cursor) and never need to live in the cache.
  static let maxPersistedMessagesPerConversation = 200

  static func visibleTail<T>(_ items: [T]) -> [T] {
    Array(items.suffix(initialMessageLimit))
  }

  /// Bound persisted history to the newest `maxPersistedMessagesPerConversation`
  /// rows so the cached snapshot stays a fixed size (JOV-5144).
  static func persistedTail<T>(_ items: [T]) -> [T] {
    Array(items.suffix(maxPersistedMessagesPerConversation))
  }

  static func hasOlderHistory(cachedCount: Int, fetchedHasMore: Bool) -> Bool {
    fetchedHasMore || cachedCount > initialMessageLimit
  }

  static func shouldOfferLoadEarlier(hasMoreOlder: Bool) -> Bool {
    hasMoreOlder
  }
}
