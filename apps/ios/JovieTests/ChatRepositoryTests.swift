import Foundation
import Testing
@testable import Jovie

@MainActor
struct ChatRepositoryTests {
  @Test func openConversationHydratesCachedMessagesBeforeNetworkRefresh() async {
    let defaultsName = "ie.jov.Jovie.tests.chat-repo.cache-first"
    let defaults = UserDefaults(suiteName: defaultsName)!
    defaults.removePersistentDomain(forName: defaultsName)
    let cache = ChatCache(defaults: defaults)
    let gate = FetchGate()
    let conversationID = "conv_cached"
    await cache.store(
      CachedChatSnapshot(
        conversations: [
          MobileConversationSummary(
            id: conversationID,
            title: "Launch plan",
            createdAt: "2026-06-21T00:00:00.000Z",
            updatedAt: "2026-06-21T01:00:00.000Z",
            latestMessageRole: "assistant",
            latestTurnStatus: "completed"
          ),
        ],
        messagesByConversationID: [
          conversationID: [
            MobileConversationMessage(
              id: "msg_cached",
              role: "assistant",
              content: "Cached launch plan",
              clientMessageId: nil,
              turnId: "turn_cached",
              turnStatus: "completed",
              createdAt: "2026-06-21T01:00:00.000Z",
              requiresWebHandoff: false
            ),
          ],
        ],
        cachedAt: Date(timeIntervalSince1970: 1_782_017_600)
      ),
      for: "user_repo_cache_first"
    )

    let repository = ChatRepository(
      client: GatedFetchChatClient(gate: gate),
      cache: cache,
      clerkUserID: "user_repo_cache_first",
      webBaseURL: URL(string: "https://preview.example")!
    )

    let openTask = Task {
      await repository.openConversation(conversationID)
    }

    await gate.waitUntilFetchStarted()
    #expect(repository.timeline.map(\.content) == ["Cached launch plan"])

    await gate.releaseFetch()
    await openTask.value

    #expect(repository.timeline.map(\.content) == ["Fresh launch plan"])
    defaults.removePersistentDomain(forName: defaultsName)
  }

  @Test func sendAppendsTimelineRowsAndMarksOfflineOnFailure() async {
    let repository = ChatRepository(
      client: FailingChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo")!),
      clerkUserID: "user_repo_test",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Help me launch")

    #expect(repository.timeline.count == 2)
    #expect(repository.timeline.first?.role == .user)
    #expect(repository.timeline.last?.status == .failed)
    #expect(repository.isOffline == true)
    #expect(repository.lastErrorMessage?.isEmpty == false)
  }
}

private actor FetchGate {
  private var didStartFetch = false
  private var didReleaseFetch = false
  private var startedContinuation: CheckedContinuation<Void, Never>?
  private var releaseContinuation: CheckedContinuation<Void, Never>?

  func waitUntilFetchStarted() async {
    if didStartFetch { return }
    await withCheckedContinuation { continuation in
      startedContinuation = continuation
    }
  }

  func markFetchStartedAndWaitForRelease() async {
    didStartFetch = true
    startedContinuation?.resume()
    startedContinuation = nil

    guard !didReleaseFetch else { return }
    await withCheckedContinuation { continuation in
      releaseContinuation = continuation
    }
  }

  func releaseFetch() {
    didReleaseFetch = true
    releaseContinuation?.resume()
    releaseContinuation = nil
  }
}

private struct GatedFetchChatClient: MobileChatClientProtocol {
  let gate: FetchGate

  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int) async throws -> MobileConversationDetailResponse {
    await gate.markFetchStartedAndWaitForRelease()
    return MobileConversationDetailResponse(
      conversation: MobileConversationRecord(
        id: id,
        title: "Launch plan",
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T01:01:00.000Z"
      ),
      messages: [
        MobileConversationMessage(
          id: "msg_fresh",
          role: "assistant",
          content: "Fresh launch plan",
          clientMessageId: nil,
          turnId: "turn_fresh",
          turnStatus: "completed",
          createdAt: "2026-06-21T01:01:00.000Z",
          requiresWebHandoff: false
        ),
      ],
      hasMore: false
    )
  }

  func sendTurn(_ request: MobileChatTurnRequest) async throws -> [MobileChatStreamEvent] {
    []
  }
}

private struct FailingChatClient: MobileChatClientProtocol {
  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int) async throws -> MobileConversationDetailResponse {
    throw MobileChatClientError.requestFailed(statusCode: 500)
  }

  func sendTurn(_ request: MobileChatTurnRequest) async throws -> [MobileChatStreamEvent] {
    throw MobileChatClientError.transportFailed(code: -1009)
  }
}
