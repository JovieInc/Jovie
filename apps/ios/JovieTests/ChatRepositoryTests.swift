import Foundation
import Testing
@testable import Jovie

@MainActor
struct ChatRepositoryTests {
  @Test func openConversationDonatesSpotlightActivity() async {
    let donator = RecordingConversationActivityDonator()
    let repository = ChatRepository(
      client: SuccessfulChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-activity")!),
      clerkUserID: "user_activity_test",
      webBaseURL: URL(string: "https://preview.example")!,
      activityDonator: donator
    )

    await repository.openConversation("conv_activity")

    #expect(donator.donations.count == 1)
    #expect(donator.donations.first?.conversationID == "conv_activity")
    #expect(donator.donations.first?.title == "Launch plan")
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

  @Test func sendIgnoresEmptyOrWhitespaceOnlyText() async {
    let repository = ChatRepository(
      client: FailingChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-empty")!),
      clerkUserID: "user_repo_empty",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "   \n  ")

    #expect(repository.timeline.isEmpty)
    #expect(repository.isSending == false)
  }

  @Test func sendOnSuccessAppliesAssistantCompletedAndRefetchesConversation() async {
    let client = ScriptedChatClient(
      sendTurnResult: .success([
        .turnReserved(conversationId: "conv_new", turnId: "turn_1", clientTurnId: "PLACEHOLDER"),
        .assistantCompleted(
          clientTurnId: "PLACEHOLDER",
          conversationId: "conv_new",
          turnId: "turn_1",
          text: "Here is your plan"
        ),
      ]),
      listConversationsResult: .success([
        MobileConversationSummary(
          id: "conv_new",
          title: "New chat",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          latestMessageRole: "assistant",
          latestTurnStatus: "completed"
        ),
      ]),
      fetchConversationResult: .success(
        MobileConversationDetailResponse(
          conversation: MobileConversationRecord(
            id: "conv_new",
            title: "New chat",
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z"
          ),
          messages: [
            MobileConversationMessage(
              id: "msg_1",
              role: "assistant",
              content: "Here is your plan",
              clientMessageId: "client_1",
              turnId: "turn_1",
              turnStatus: "completed",
              createdAt: "2026-06-01T00:00:00.000Z",
              requiresWebHandoff: false
            ),
          ],
          hasMore: false
        )
      )
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-success")!),
      clerkUserID: "user_repo_success",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Plan my next release")

    #expect(repository.isOffline == false)
    #expect(repository.lastErrorMessage == nil)
    #expect(repository.activeConversationID == "conv_new")
    #expect(repository.conversations.map(\.id) == ["conv_new"])
    // openConversation replaces the optimistic timeline with the server's
    // canonical messages for the now-known conversation ID.
    #expect(repository.timeline.map(\.content) == ["Here is your plan"])
  }

  @Test func sendAppliesWebHandoffEventAndFlagsRequiresWebHandoff() async {
    let handoffURL = URL(string: "https://jov.ie/app/chat/conv_handoff")!
    let client = ScriptedChatClient(
      sendTurnResult: .success([
        .webHandoff(
          clientTurnId: "PLACEHOLDER",
          conversationId: "conv_handoff",
          url: handoffURL,
          summary: "Continue on web to finish this"
        ),
      ]),
      listConversationsResult: .success([]),
      fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 404))
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-handoff")!),
      clerkUserID: "user_repo_handoff",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Do something only the web can do")

    #expect(repository.activeConversationID == "conv_handoff")
    let assistantItem = repository.timeline.first { $0.role == .assistant }
    #expect(assistantItem?.requiresWebHandoff == true)
    // refreshConversations() persists the post-apply() timeline to cache under
    // the now-known conversation ID before openConversation() runs; since the
    // subsequent fetchConversation() fails, openConversation() rehydrates from
    // that just-written cache entry. Cache rehydration recomputes handoffURL
    // from webBaseURL (see ChatRepository.timelineItem(from:)) rather than
    // preserving the raw URL carried on the original stream event.
    #expect(assistantItem?.handoffURL == URL(string: "https://preview.example/app/chat/conv_handoff"))
    #expect(assistantItem?.content == "Continue on web to finish this")
  }

  @Test func sendAppliesErrorEventAsFailedStatusWithoutThrowing() async {
    let client = ScriptedChatClient(
      sendTurnResult: .success([
        .error(code: "RATE_LIMITED", message: "Slow down and try again"),
      ]),
      listConversationsResult: .success([]),
      fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 404))
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-error-event")!),
      clerkUserID: "user_repo_error_event",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Trigger a rate limit")

    let assistantItem = repository.timeline.first { $0.role == .assistant }
    #expect(assistantItem?.status == .failed)
    #expect(assistantItem?.content == "Slow down and try again")
    // markAssistantFailed sets lastErrorMessage synchronously inside apply(events:),
    // but send() unconditionally awaits refreshConversations() right after, which
    // succeeds here and resets lastErrorMessage to nil on its success path. Because
    // a bare .error event carries no conversationId, resolvedConversationID(from:)
    // returns nil and activeConversationID is never set, so openConversation() is
    // skipped entirely -- refreshConversations()'s success branch is the last writer.
    #expect(repository.lastErrorMessage == nil)
    // An in-band error event is not a transport failure, so isOffline must stay false.
    #expect(repository.isOffline == false)
    #expect(repository.activeConversationID == nil)
  }

  @Test func retryRemovesFailedTurnAndResendsUserText() async {
    let client = ScriptedChatClient(
      sendTurnResult: .failure(MobileChatClientError.transportFailed(code: -1009)),
      listConversationsResult: .success([]),
      fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 404))
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-retry")!),
      clerkUserID: "user_repo_retry",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Retry me")
    #expect(repository.timeline.count == 2)
    let originalClientTurnId = repository.timeline.first?.clientTurnId ?? ""
    #expect(originalClientTurnId.isEmpty == false)

    await repository.retry(clientTurnId: originalClientTurnId)

    // retry() drops the failed turn and re-sends as a brand new turn, so the
    // timeline still has exactly one user + one assistant row, but the
    // clientTurnId is regenerated (not reused).
    #expect(repository.timeline.count == 2)
    #expect(repository.timeline.first?.content == "Retry me")
    #expect(repository.timeline.first?.clientTurnId != originalClientTurnId)
  }

  @Test func retryWithUnknownClientTurnIdIsANoOp() async {
    let repository = ChatRepository(
      client: FailingChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-retry-noop")!),
      clerkUserID: "user_repo_retry_noop",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.retry(clientTurnId: "does-not-exist")

    #expect(repository.timeline.isEmpty)
    #expect(repository.isSending == false)
  }

  @Test func refreshConversationsOnFailureFallsBackToCacheAndMarksOffline() async {
    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-refresh")!)
    await cache.store(
      CachedChatSnapshot(
        conversations: [
          MobileConversationSummary(
            id: "conv_cached",
            title: "Cached chat",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-01T00:00:00.000Z",
            latestMessageRole: "assistant",
            latestTurnStatus: "completed"
          ),
        ],
        messagesByConversationID: [:],
        cachedAt: Date(timeIntervalSince1970: 1_700_000_000)
      ),
      for: "user_repo_refresh"
    )

    let client = ScriptedChatClient(
      sendTurnResult: .failure(MobileChatClientError.transportFailed(code: -1009)),
      listConversationsResult: .failure(MobileChatClientError.requestFailed(statusCode: 500)),
      fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 404))
    )

    let repository = ChatRepository(
      client: client,
      cache: cache,
      clerkUserID: "user_repo_refresh",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.refreshConversations()

    #expect(repository.conversations.map(\.id) == ["conv_cached"])
    #expect(repository.isOffline == true)
    #expect(repository.isLoadingConversations == false)
    #expect(repository.lastErrorMessage?.isEmpty == false)
  }

  @Test func refreshConversationsOnSuccessClearsOfflineStateAndPersists() async {
    let client = ScriptedChatClient(
      sendTurnResult: .failure(MobileChatClientError.transportFailed(code: -1009)),
      listConversationsResult: .success([
        MobileConversationSummary(
          id: "conv_fresh",
          title: "Fresh chat",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          latestMessageRole: "assistant",
          latestTurnStatus: "completed"
        ),
      ]),
      fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 404))
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-refresh-ok")!),
      clerkUserID: "user_repo_refresh_ok",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.refreshConversations()

    #expect(repository.conversations.map(\.id) == ["conv_fresh"])
    #expect(repository.isOffline == false)
    #expect(repository.lastErrorMessage == nil)
  }

  @Test func openConversationOnFailureFallsBackToCachedMessagesForThatConversation() async {
    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-open-fail")!)
    await cache.store(
      CachedChatSnapshot(
        conversations: [],
        messagesByConversationID: [
          "conv_offline": [
            MobileConversationMessage(
              id: "msg_offline",
              role: "assistant",
              content: "Cached reply",
              clientMessageId: "client_offline",
              turnId: "turn_offline",
              turnStatus: "completed",
              createdAt: "2026-05-01T00:00:00.000Z",
              requiresWebHandoff: false
            ),
          ],
        ],
        cachedAt: Date(timeIntervalSince1970: 1_700_000_000)
      ),
      for: "user_repo_open_fail"
    )

    let repository = ChatRepository(
      client: FailingChatClient(),
      cache: cache,
      clerkUserID: "user_repo_open_fail",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.openConversation("conv_offline")

    #expect(repository.activeConversationID == "conv_offline")
    #expect(repository.timeline.map(\.content) == ["Cached reply"])
    #expect(repository.isOffline == true)
  }

  @Test func openConversationOnSuccessMapsWebHandoffMessagesWithHandoffURL() async {
    let client = ScriptedChatClient(
      sendTurnResult: .failure(MobileChatClientError.transportFailed(code: -1009)),
      listConversationsResult: .success([]),
      fetchConversationResult: .success(
        MobileConversationDetailResponse(
          conversation: MobileConversationRecord(
            id: "conv_open",
            title: "Open chat",
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z"
          ),
          messages: [
            MobileConversationMessage(
              id: "msg_open",
              role: "assistant",
              content: "Finish this on web",
              clientMessageId: "client_open",
              turnId: "turn_open",
              turnStatus: "completed",
              createdAt: "2026-06-01T00:00:00.000Z",
              requiresWebHandoff: true
            ),
          ],
          hasMore: false
        )
      )
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-open-ok")!),
      clerkUserID: "user_repo_open_ok",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.openConversation("conv_open")

    #expect(repository.isOffline == false)
    #expect(repository.timeline.first?.requiresWebHandoff == true)
    #expect(
      repository.timeline.first?.handoffURL
        == URL(string: "https://preview.example/app/chat/conv_open")
    )
  }

  @Test func startNewConversationClearsActiveConversationAndTimeline() async {
    let client = ScriptedChatClient(
      sendTurnResult: .failure(MobileChatClientError.transportFailed(code: -1009)),
      listConversationsResult: .success([]),
      fetchConversationResult: .success(
        MobileConversationDetailResponse(
          conversation: MobileConversationRecord(
            id: "conv_reset",
            title: "Reset chat",
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z"
          ),
          messages: [],
          hasMore: false
        )
      )
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-newconvo")!),
      clerkUserID: "user_repo_newconvo",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.openConversation("conv_reset")
    #expect(repository.activeConversationID == "conv_reset")

    repository.startNewConversation()

    #expect(repository.activeConversationID == nil)
    #expect(repository.timeline.isEmpty)
    #expect(repository.lastErrorMessage == nil)
  }
}

private final class RecordingConversationActivityDonator: ConversationActivityDonating, @unchecked Sendable {
  struct Donation: Equatable {
    let conversationID: String
    let title: String
  }

  private(set) var donations: [Donation] = []

  func donate(conversationID: String, title: String) {
    donations.append(Donation(conversationID: conversationID, title: title))
  }
}

private struct SuccessfulChatClient: MobileChatClientProtocol {
  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int) async throws -> MobileConversationDetailResponse {
    MobileConversationDetailResponse(
      conversation: MobileConversationRecord(
        id: id,
        title: "Launch plan",
        createdAt: "2026-07-02T00:00:00Z",
        updatedAt: "2026-07-02T00:00:00Z"
      ),
      messages: [],
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

/// A scripted client whose canned `sendTurn` events are rewritten per-call so
/// their `clientTurnId` matches whatever `ChatRepository.send` generated for
/// that specific invocation (repository generates a fresh UUID per call, so a
/// fixed fixture value can never match it directly).
private final class ScriptedChatClient: MobileChatClientProtocol, @unchecked Sendable {
  private let sendTurnResult: Result<[MobileChatStreamEvent], Error>
  private let listConversationsResult: Result<[MobileConversationSummary], Error>
  private let fetchConversationResult: Result<MobileConversationDetailResponse, Error>

  init(
    sendTurnResult: Result<[MobileChatStreamEvent], Error>,
    listConversationsResult: Result<[MobileConversationSummary], Error>,
    fetchConversationResult: Result<MobileConversationDetailResponse, Error>
  ) {
    self.sendTurnResult = sendTurnResult
    self.listConversationsResult = listConversationsResult
    self.fetchConversationResult = fetchConversationResult
  }

  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    try listConversationsResult.get()
  }

  func fetchConversation(id: String, limit: Int) async throws -> MobileConversationDetailResponse {
    try fetchConversationResult.get()
  }

  func sendTurn(_ request: MobileChatTurnRequest) async throws -> [MobileChatStreamEvent] {
    let events = try sendTurnResult.get()
    return events.map { rewriteClientTurnId($0, to: request.clientTurnId) }
  }

  private func rewriteClientTurnId(
    _ event: MobileChatStreamEvent,
    to clientTurnId: String
  ) -> MobileChatStreamEvent {
    switch event {
    case let .turnReserved(conversationId, turnId, _):
      return .turnReserved(conversationId: conversationId, turnId: turnId, clientTurnId: clientTurnId)
    case let .assistantDelta(_, text):
      return .assistantDelta(clientTurnId: clientTurnId, text: text)
    case let .assistantCompleted(_, conversationId, turnId, text):
      return .assistantCompleted(
        clientTurnId: clientTurnId,
        conversationId: conversationId,
        turnId: turnId,
        text: text
      )
    case let .webHandoff(_, conversationId, url, summary):
      return .webHandoff(clientTurnId: clientTurnId, conversationId: conversationId, url: url, summary: summary)
    case .error:
      return event
    }
  }
}