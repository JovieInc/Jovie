import Foundation
import Testing
@testable import Jovie

struct MobileChatClientTests {
  @Test func cachedChatSnapshotRoundTripsThroughChatCache() async {
    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-cache")!)
    await cache.remove(for: "user_chat_cache")

    let snapshot = CachedChatSnapshot(
      conversations: [
        MobileConversationSummary(
          id: "conv_1",
          title: "Launch plan",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-02T00:00:00.000Z",
          latestMessageRole: "assistant",
          latestTurnStatus: "completed"
        ),
      ],
      messagesByConversationID: [
        "conv_1": [
          MobileConversationMessage(
            id: "msg_1",
            role: "assistant",
            content: "Hello from Jovie",
            clientMessageId: "client_1",
            turnId: "turn_1",
            turnStatus: "completed",
            createdAt: "2026-06-02T00:00:00.000Z",
            requiresWebHandoff: false
          ),
        ],
      ],
      cachedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )

    await cache.store(snapshot, for: "user_chat_cache")
    let loaded = await cache.load(for: "user_chat_cache")

    #expect(loaded == snapshot)
  }
}