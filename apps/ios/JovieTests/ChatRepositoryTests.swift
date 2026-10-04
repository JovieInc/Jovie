import Foundation
import JovieKit
import Testing
@testable import Jovie

@MainActor
struct ChatRepositoryTests {
  @Test func openConversationDonatesSpotlightActivity() async {
    let donator = RecordingConversationActivityDonator()
    let repository = ChatRepository(
      client: SuccessfulChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-activity")!),
      userID: "user_activity_test",
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
      userID: "user_repo_test",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Help me launch")

    #expect(repository.timeline.count == 2)
    #expect(repository.timeline.first?.role == .user)
    #expect(repository.timeline.last?.status == .failed)
    #expect(repository.isOffline == true)
    #expect(repository.sessionExpired == false)
    #expect(repository.lastErrorMessage?.isEmpty == false)
  }

  @Test func sendIgnoresEmptyOrWhitespaceOnlyText() async {
    let repository = ChatRepository(
      client: FailingChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-empty")!),
      userID: "user_repo_empty",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "   \n  ")

    #expect(repository.timeline.isEmpty)
    #expect(repository.isSending == false)
  }

  @Test func sendAppliesStreamEventsWithoutRefetchAndDoesNotMarkOfflineWhenListOrFetchWouldFail() async {
    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-success")!)
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
      listConversationsResult: .failure(MobileChatClientError.requestFailed(statusCode: 500)),
      fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 404))
    )

    let repository = ChatRepository(
      client: client,
      cache: cache,
      userID: "user_repo_success",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Plan my next release")

    #expect(repository.isSending == false)
    #expect(repository.isOffline == false)
    #expect(repository.lastErrorMessage == nil)
    #expect(repository.activeConversationID == "conv_new")
    #expect(repository.conversations.isEmpty)
    #expect(client.listConversationsCallCount == 0)
    #expect(client.fetchConversationCallCount == 0)
    #expect(repository.timeline.map(\.role) == [.user, .assistant])
    #expect(repository.timeline.map(\.content) == ["Plan my next release", "Here is your plan"])
    #expect(repository.timeline.last?.status == .completed)

    let snapshot = await cache.load(for: "user_repo_success")
    #expect(snapshot?.messagesByConversationID["conv_new"]?.map(\.content) == [
      "Plan my next release",
      "Here is your plan",
    ])
  }

  @Test func sendKeepsCompletedAssistantWhenLaterStreamLineIsMalformed() async {
    let client = StreamingThenFailingChatClient(
      events: [
        .turnReserved(conversationId: "conv_kept", turnId: "turn_1", clientTurnId: "PLACEHOLDER"),
        .assistantCompleted(
          clientTurnId: "PLACEHOLDER",
          conversationId: "conv_kept",
          turnId: "turn_1",
          text: "Kept reply"
        ),
      ]
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-malformed")!),
      userID: "user_repo_malformed",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Keep this")

    let assistantItem = repository.timeline.first { $0.role == .assistant }
    #expect(assistantItem?.status == .completed)
    #expect(assistantItem?.content == "Kept reply")
    #expect(repository.isOffline == false)
    #expect(repository.lastErrorMessage?.isEmpty == false)
    #expect(repository.isSending == false)
  }

  @Test func sendCoalescesStreamDeltasIntoAssistantTimeline() async {
    let client = ScriptedChatClient(
      sendTurnResult: .success([
        .turnReserved(conversationId: "conv_stream", turnId: "turn_1", clientTurnId: "PLACEHOLDER"),
        .assistantDelta(clientTurnId: "PLACEHOLDER", text: "A"),
        .assistantDelta(clientTurnId: "PLACEHOLDER", text: " streamed"),
        .assistantDelta(clientTurnId: "PLACEHOLDER", text: " answer"),
        .assistantCompleted(
          clientTurnId: "PLACEHOLDER",
          conversationId: "conv_stream",
          turnId: "turn_1",
          text: "A streamed answer"
        ),
      ]),
      listConversationsResult: .success([]),
      fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 404))
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-stream")!),
      userID: "user_repo_stream",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Stream this")

    let assistantItem = repository.timeline.first { $0.role == .assistant }
    // Durable Summer streams must end with a terminal event: a stream that
    // finishes mid-flight marks the turn failed
    // (see ovieDurableSummerStatesCoverRedPathsAndResume).
    #expect(assistantItem?.status == .completed)
    #expect(assistantItem?.content == "A streamed answer")
  }

  // MARK: - JOV-5874 chat smoothness

  @Test func sendCoalescesRapidDeltasAndStillCompletesTheTurn() async {
    let client = ScriptedChatClient(
      sendTurnResult: .success([
        .turnReserved(conversationId: "conv_burst", turnId: "turn_1", clientTurnId: "PLACEHOLDER"),
        .assistantDelta(clientTurnId: "PLACEHOLDER", text: "one"),
        .assistantDelta(clientTurnId: "PLACEHOLDER", text: " two"),
        .assistantDelta(clientTurnId: "PLACEHOLDER", text: " three"),
        .assistantCompleted(
          clientTurnId: "PLACEHOLDER",
          conversationId: "conv_burst",
          turnId: "turn_1",
          text: "one two three"
        ),
      ]),
      listConversationsResult: .success([]),
      fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 404))
    )
    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-burst")!),
      userID: "user_repo_burst",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Burst")

    let assistantItem = repository.timeline.first { $0.role == .assistant }
    #expect(assistantItem?.status == .completed)
    #expect(assistantItem?.content == "one two three")
    #expect(repository.isSending == false)
  }

  @Test func openConversationPaintsCachedMessagesBeforeNetworkFetchLands() async {
    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-open-cache-first")!)
    await cache.store(
      CachedChatSnapshot(
        conversations: [],
        messagesByConversationID: [
          "conv_cached": [
            MobileConversationMessage(
              id: "msg_cached",
              role: "assistant",
              content: "Cached reply",
              clientMessageId: "client_cached",
              turnId: "turn_cached",
              turnStatus: "completed",
              createdAt: "2026-05-01T00:00:00.000Z",
              requiresWebHandoff: false
            ),
          ],
        ],
        cachedAt: Date(timeIntervalSince1970: 1_700_000_000)
      ),
      for: "user_repo_open_cache_first"
    )
    let client = GatedFetchChatClient(
      detail: MobileConversationDetailResponse(
        conversation: MobileConversationRecord(
          id: "conv_cached",
          title: "Fresh title",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z"
        ),
        messages: [
          MobileConversationMessage(
            id: "msg_fresh",
            role: "assistant",
            content: "Fresh reply",
            clientMessageId: "client_fresh",
            turnId: "turn_fresh",
            turnStatus: "completed",
            createdAt: "2026-05-02T00:00:00.000Z",
            requiresWebHandoff: false
          ),
        ],
        hasMore: false
      )
    )
    let repository = ChatRepository(
      client: client,
      cache: cache,
      userID: "user_repo_open_cache_first",
      webBaseURL: URL(string: "https://preview.example")!
    )

    let open = Task { await repository.openConversation("conv_cached") }
    await client.waitUntilFetchRequested()

    #expect(repository.activeConversationID == "conv_cached")
    #expect(repository.timeline.map(\.content) == ["Cached reply"])

    client.releaseFetch()
    await open.value

    #expect(repository.timeline.map(\.content) == ["Fresh reply"])
    #expect(repository.isOffline == false)
  }

  @Test func openConversationClearsPreviousThreadOnCacheMissWhileFetching() async {
    let client = GatedFetchChatClient(
      detail: MobileConversationDetailResponse(
        conversation: MobileConversationRecord(
          id: "conv_b",
          title: "B",
          createdAt: "2026-05-02T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z"
        ),
        messages: [],
        hasMore: false
      )
    )
    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-open-cache-miss")!),
      userID: "user_repo_open_cache_miss",
      webBaseURL: URL(string: "https://preview.example")!
    )
    repository.seedTimelineForUITesting(
      [
        MobileChatTimelineItem(
          id: "assistant:a",
          role: .assistant,
          content: "Thread A reply",
          status: .completed,
          clientTurnId: "a",
          requiresWebHandoff: false,
          handoffURL: nil
        ),
      ],
      activeConversationID: "conv_a"
    )

    let open = Task { await repository.openConversation("conv_b") }
    await client.waitUntilFetchRequested()

    #expect(repository.activeConversationID == "conv_b")
    #expect(repository.timeline.isEmpty)

    client.releaseFetch()
    await open.value
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
      userID: "user_repo_handoff",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Do something only the web can do")

    #expect(repository.activeConversationID == "conv_handoff")
    let assistantItem = repository.timeline.first { $0.role == .assistant }
    #expect(assistantItem?.requiresWebHandoff == true)
    #expect(assistantItem?.handoffURL == handoffURL)
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
      userID: "user_repo_error_event",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Trigger a rate limit")

    let assistantItem = repository.timeline.first { $0.role == .assistant }
    #expect(assistantItem?.status == .failed)
    #expect(assistantItem?.content == "Slow down and try again")
    #expect(repository.lastErrorMessage == "Slow down and try again")
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
      userID: "user_repo_retry",
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
      userID: "user_repo_retry_noop",
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
      userID: "user_repo_refresh",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.refreshConversations()

    #expect(repository.conversations.map(\.id) == ["conv_cached"])
    #expect(repository.isOffline == true)
    #expect(repository.sessionExpired == false)
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
      userID: "user_repo_refresh_ok",
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
      userID: "user_repo_open_fail",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.openConversation("conv_offline")

    #expect(repository.activeConversationID == "conv_offline")
    #expect(repository.timeline.map(\.content) == ["Cached reply"])
    #expect(repository.isOffline == true)
    #expect(repository.sessionExpired == false)
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
      userID: "user_repo_open_ok",
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
      userID: "user_repo_newconvo",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.openConversation("conv_reset")
    #expect(repository.activeConversationID == "conv_reset")

    repository.startNewConversation()

    #expect(repository.activeConversationID == nil)
    #expect(repository.timeline.isEmpty)
    #expect(repository.hasMoreOlder == false)
    #expect(repository.lastErrorMessage == nil)
  }

  /// JOV-5144: the persisted snapshot must stay bounded. Load-earlier pages
  /// accumulate into the timeline; persisting the whole thing grows resident
  /// RAM without limit (watchdog kills). The cache must keep only the newest
  /// `ChatTranscriptWindow.maxPersistedMessagesPerConversation` rows.
  @Test func persistCacheBoundsPersistedHistoryToThePersistedWindow() async {
    let suiteName = "ie.jov.Jovie.tests.chat-repo-persist-bound"
    let cache = ChatCache(defaults: UserDefaults(suiteName: suiteName)!)
    let client = ScriptedChatClient(
      sendTurnResult: .success([]),
      listConversationsResult: .success([]),
      fetchConversationResult: .success(
        MobileConversationDetailResponse(
          conversation: MobileConversationRecord(
            id: "conv_bound",
            title: "Bounded",
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z"
          ),
          messages: (1...250).map { index in
            MobileConversationMessage(
              id: "msg_bound_\(index)",
              role: index.isMultiple(of: 2) ? "assistant" : "user",
              content: "Bounded \(index)",
              clientMessageId: "client_bound_\(index)",
              turnId: "turn_bound_\(index)",
              turnStatus: "completed",
              createdAt: "2026-06-01T00:00:\(String(format: "%02d", index % 60)).000Z",
              requiresWebHandoff: false
            )
          },
          hasMore: true
        )
      )
    )
    let repository = ChatRepository(
      client: client,
      cache: cache,
      userID: "user_repo_persist_bound",
      webBaseURL: URL(string: "https://preview.example")!
    )

    // Fetch window persist path (openConversation persists detail.messages).
    await repository.openConversation("conv_bound")

    let fetchedSnapshot = await cache.load(for: "user_repo_persist_bound")
    let fetchedRows = fetchedSnapshot?.messagesByConversationID["conv_bound"] ?? []
    #expect(fetchedRows.count == ChatTranscriptWindow.maxPersistedMessagesPerConversation)
    // Newest rows survive the bound; oldest rows drop.
    #expect(fetchedRows.first?.content == "Bounded 51")
    #expect(fetchedRows.last?.content == "Bounded 250")
  }

  @Test func openConversationPaintsCachedTailThenFetchesWindow() async {
    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-cache-first")!)
    let cachedMessages = (1...45).map { index in
      MobileConversationMessage(
        id: "msg_cached_\(index)",
        role: index.isMultiple(of: 2) ? "assistant" : "user",
        content: "Cached \(index)",
        clientMessageId: "client_cached_\(index)",
        turnId: "turn_cached_\(index)",
        turnStatus: "completed",
        createdAt: "2026-05-01T00:00:\(String(format: "%02d", index)).000Z",
        requiresWebHandoff: false
      )
    }
    await cache.store(
      CachedChatSnapshot(
        conversations: [],
        messagesByConversationID: ["conv_cached": cachedMessages],
        cachedAt: Date(timeIntervalSince1970: 1_700_000_000)
      ),
      for: "user_repo_cache_first"
    )

    let client = GateableFetchChatClient(
      detail: MobileConversationDetailResponse(
        conversation: MobileConversationRecord(
          id: "conv_cached",
          title: "Cached chat",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z"
        ),
        messages: [
          MobileConversationMessage(
            id: "msg_network",
            role: "assistant",
            content: "Network reply",
            clientMessageId: "client_network",
            turnId: "turn_network",
            turnStatus: "completed",
            createdAt: "2026-06-01T00:00:00.000Z",
            requiresWebHandoff: false
          ),
        ],
        hasMore: true
      )
    )
    let repository = ChatRepository(
      client: client,
      cache: cache,
      userID: "user_repo_cache_first",
      webBaseURL: URL(string: "https://preview.example")!
    )

    let openTask = Task { await repository.openConversation("conv_cached") }
    // Time-bounded wait for the cache-first paint instead of a fixed yield
    // budget: under merge-queue runner load a fixed 50-iteration loop can
    // expire before the parallel executor paints the cached tail.
    let cachePaintDeadline = Date().addingTimeInterval(10)
    while repository.timeline.map(\.content) != Array(6...45).map({ "Cached \($0)" }),
          Date() < cachePaintDeadline {
      await Task.yield()
    }
    #expect(repository.timeline.map(\.content) == Array(6...45).map { "Cached \($0)" })
    #expect(repository.hasMoreOlder)

    client.releaseFetch()
    await openTask.value

    #expect(client.lastFetchLimit == ChatTranscriptWindow.initialMessageLimit)
    #expect(client.lastFetchBefore == nil)
    #expect(repository.timeline.map(\.content) == ["Network reply"])
    #expect(repository.hasMoreOlder)
  }

  @Test func loadOlderMessagesPrependsPreviousWindow() async {
    let older = MobileConversationMessage(
      id: "msg_older",
      role: "user",
      content: "Older",
      clientMessageId: "client_older",
      turnId: "turn_older",
      turnStatus: "completed",
      createdAt: "2026-05-01T00:00:00.000Z",
      requiresWebHandoff: false
    )
    let newer = MobileConversationMessage(
      id: "msg_newer",
      role: "assistant",
      content: "Newer",
      clientMessageId: "client_newer",
      turnId: "turn_newer",
      turnStatus: "completed",
      createdAt: "2026-06-01T00:00:00.000Z",
      requiresWebHandoff: false
    )
    let client = ScriptedPagedChatClient(
      pages: [
        nil: MobileConversationDetailResponse(
          conversation: MobileConversationRecord(
            id: "conv_paged",
            title: "Paged",
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z"
          ),
          messages: [newer],
          hasMore: true
        ),
        "2026-06-01T00:00:00.000Z": MobileConversationDetailResponse(
          conversation: MobileConversationRecord(
            id: "conv_paged",
            title: "Paged",
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z"
          ),
          messages: [older],
          hasMore: false
        ),
      ]
    )
    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-paged")!),
      userID: "user_repo_paged",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.openConversation("conv_paged")
    #expect(repository.timeline.map(\.content) == ["Newer"])
    #expect(repository.hasMoreOlder)

    await repository.loadOlderMessages()
    #expect(client.lastFetchBefore == "2026-06-01T00:00:00.000Z")
    #expect(repository.timeline.map(\.content) == ["Older", "Newer"])
    #expect(repository.hasMoreOlder == false)
  }

  // MARK: - JOV-6210 restart pagination

  @Test func loadOlderMessagesUsesOldestMessageInMultiMessageWindowAsCursor() async {
    let conversation = MobileConversationRecord(
      id: "conv_paged",
      title: "Paged",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    )
    func message(_ id: String, _ createdAt: String) -> MobileConversationMessage {
      MobileConversationMessage(
        id: id,
        role: "assistant",
        content: id,
        clientMessageId: "client_\(id)",
        turnId: "turn_\(id)",
        turnStatus: "completed",
        createdAt: createdAt,
        requiresWebHandoff: false
      )
    }
    let client = ScriptedPagedChatClient(
      pages: [
        nil: MobileConversationDetailResponse(
          conversation: conversation,
          messages: [
            message("msg_oldest", "2026-05-01T00:00:00.000Z"),
            message("msg_newest", "2026-06-01T00:00:00.000Z"),
          ],
          hasMore: true
        ),
        "2026-05-01T00:00:00.000Z": MobileConversationDetailResponse(
          conversation: conversation,
          messages: [],
          hasMore: false
        ),
      ]
    )
    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-cursor-oldest")!),
      userID: "user_repo_cursor_oldest",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.openConversation("conv_paged")
    await repository.loadOlderMessages()

    // The `before` cursor must be the oldest message in the window, not the
    // newest -- otherwise the next page overlaps the visible window.
    #expect(client.lastFetchBefore == "2026-05-01T00:00:00.000Z")
  }

  /// Restart pagination (JOV-6210): the relaunched repository hydrates only
  /// from the persisted snapshot, so the load-earlier cursor must be the
  /// oldest cached message's server `createdAt` — not the timestamp
  /// `persistCache` wrote — and `hasMoreOlder` must survive the round-trip so
  /// load-earlier is offered at all for a window under the fetch limit.
  @Test func loadOlderMessagesAfterRestartUsesCachedServerTimestamp() async {
    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-restart")!)
    let conversation = MobileConversationRecord(
      id: "conv_restart",
      title: "Restart",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    )
    func message(_ suffix: String, _ content: String, _ createdAt: String) -> MobileConversationMessage {
      MobileConversationMessage(
        id: "msg_\(suffix)",
        role: "user",
        content: content,
        clientMessageId: "client_\(suffix)",
        turnId: "turn_\(suffix)",
        turnStatus: "completed",
        createdAt: createdAt,
        requiresWebHandoff: false
      )
    }
    let client = ScriptedPagedChatClient(
      pages: [
        nil: MobileConversationDetailResponse(
          conversation: conversation,
          messages: [
            message("mid", "Middle", "2026-05-01T00:00:00.000Z"),
            message("new", "Newest", "2026-06-01T00:00:00.000Z"),
          ],
          hasMore: true
        ),
        "2026-05-01T00:00:00.000Z": MobileConversationDetailResponse(
          conversation: conversation,
          messages: [
            message("old", "Oldest", "2026-04-01T00:00:00.000Z"),
          ],
          hasMore: false
        ),
      ]
    )

    let first = ChatRepository(
      client: client,
      cache: cache,
      userID: "user_repo_restart",
      webBaseURL: URL(string: "https://preview.example")!
    )
    await first.openConversation("conv_restart")
    #expect(first.hasMoreOlder)

    let relaunched = ChatRepository(
      client: client,
      cache: cache,
      userID: "user_repo_restart",
      webBaseURL: URL(string: "https://preview.example")!
    )
    await relaunched.bootstrap()
    #expect(relaunched.timeline.map(\.content) == ["Middle", "Newest"])
    #expect(relaunched.hasMoreOlder)

    await relaunched.loadOlderMessages()

    // The multi-message window proves the cursor comes from the oldest
    // message, not the newest.
    #expect(client.lastFetchBefore == "2026-05-01T00:00:00.000Z")
    #expect(relaunched.timeline.map(\.content) == ["Oldest", "Middle", "Newest"])
    #expect(relaunched.hasMoreOlder == false)
  }

  /// JOV-6210: `persistCache` must keep the server `createdAt` on cached
  /// messages so a cold-start `paintCachedWindow` derives an `olderCursor`
  /// into real history instead of the cache-write time. Uses a multi-message
  /// window so the oldest message — not the newest — becomes the cursor.
  @Test func loadEarlierAfterRestartUsesPreservedCacheTimestamps() async {
    func makeMessage(
      _ index: Int,
      createdAt: String
    ) -> MobileConversationMessage {
      MobileConversationMessage(
        id: "msg_restart_\(index)",
        role: index.isMultiple(of: 2) ? "assistant" : "user",
        content: "M\(index)",
        clientMessageId: "client_restart_\(index)",
        turnId: "turn_restart_\(index)",
        turnStatus: "completed",
        createdAt: createdAt,
        requiresWebHandoff: false
      )
    }
    func detail(_ messages: [MobileConversationMessage], hasMore: Bool) -> MobileConversationDetailResponse {
      MobileConversationDetailResponse(
        conversation: MobileConversationRecord(
          id: "conv_restart",
          title: "Restart",
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z"
        ),
        messages: messages,
        hasMore: hasMore
      )
    }

    // Server returns each page oldest-first; the newest window lands first.
    let windowMessages = (1...40).map {
      makeMessage($0, createdAt: "2026-06-01T00:00:\(String(format: "%02d", $0)).000Z")
    }
    let olderMessages = (41...45).map {
      makeMessage($0, createdAt: "2026-05-01T00:00:\(String(format: "%02d", $0)).000Z")
    }
    let oldestWindowCreatedAt = windowMessages[0].createdAt

    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-restart")!)
    let client = ScriptedPagedChatClient(
      pages: [
        nil: detail(windowMessages, hasMore: true),
        oldestWindowCreatedAt: detail(olderMessages, hasMore: false),
      ]
    )
    let repository = ChatRepository(
      client: client,
      cache: cache,
      userID: "user_repo_restart",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.openConversation("conv_restart")
    await repository.loadOlderMessages()
    #expect(repository.timeline.count == 45)
    #expect(repository.hasMoreOlder == false)

    // The cache must hold the original server timestamps — not the
    // `persistCache` write time — for every round-tripped timeline row.
    let snapshot = await cache.load(for: "user_repo_restart")
    #expect(
      snapshot?.messagesByConversationID["conv_restart"]?.map(\.createdAt)
        == olderMessages.map(\.createdAt) + windowMessages.map(\.createdAt)
    )

    // Simulated cold start: a fresh repository hydrates purely from cache
    // (`.jovie` bootstrap performs no fetch). The visible tail is cached
    // messages 6...45, so `olderCursor` must be the oldest *window* message.
    let restartClient = ScriptedChatClient(
      sendTurnResult: .success([]),
      listConversationsResult: .success([]),
      fetchConversationResult: .success(detail(olderMessages, hasMore: true))
    )
    let restarted = ChatRepository(
      client: restartClient,
      cache: cache,
      userID: "user_repo_restart",
      webBaseURL: URL(string: "https://preview.example")!
    )
    await restarted.bootstrap()

    #expect(
      restarted.timeline.map(\.id)
        == snapshot?.messagesByConversationID["conv_restart"]?.suffix(40).map(\.id)
    )
    #expect(restarted.hasMoreOlder)

    await restarted.loadOlderMessages()
    #expect(restartClient.lastFetchBefore == oldestWindowCreatedAt)
  }

  @Test func persistCachePreservesServerTimestampsForRestartPagination() async {
    // The timeline -> MobileConversationMessage round-trip in persistCache must
    // keep the server createdAt. If it rewrites timestamps to Date(), a
    // post-restart paintCachedWindow derives an olderCursor of ~now and
    // load-earlier refetches the current window instead of older history.
    let suite = "ie.jov.Jovie.tests.chat-repo-restart-cursor"
    let cache = ChatCache(defaults: UserDefaults(suiteName: suite)!)
    let userID = "user_repo_restart_cursor"
    let url = URL(string: "https://preview.example")!
    let conversation = MobileConversationRecord(
      id: "conv_restart",
      title: "Restart",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    )
    func message(id: String, createdAt: String) -> MobileConversationMessage {
      MobileConversationMessage(
        id: id,
        role: "assistant",
        content: id,
        clientMessageId: "client_\(id)",
        turnId: "turn_\(id)",
        turnStatus: "completed",
        createdAt: createdAt,
        requiresWebHandoff: false
      )
    }
    let window = (1...ChatTranscriptWindow.initialMessageLimit).map { index in
      message(
        id: "msg_\(index)",
        createdAt: "2026-05-01T00:00:\(String(format: "%02d", index)).000Z"
      )
    }
    let older = (1...5).map { index in
      message(
        id: "msg_old_\(index)",
        createdAt: "2026-04-30T00:00:0\(index).000Z"
      )
    }
    let firstClient = ScriptedPagedChatClient(
      pages: [
        nil: MobileConversationDetailResponse(
          conversation: conversation, messages: window, hasMore: true
        ),
        "2026-05-01T00:00:01.000Z": MobileConversationDetailResponse(
          conversation: conversation, messages: older, hasMore: false
        ),
      ]
    )
    let repository = ChatRepository(
      client: firstClient, cache: cache, userID: userID, webBaseURL: url
    )

    await repository.openConversation("conv_restart")
    await repository.loadOlderMessages()

    // The merged 45-message timeline was persisted via the timeline
    // round-trip; server timestamps must survive unchanged.
    let snapshot = await cache.load(for: userID)
    let cached = snapshot?.messagesByConversationID["conv_restart"] ?? []
    #expect(cached.count == 45)
    #expect(cached.first?.createdAt == "2026-04-30T00:00:01.000Z")
    #expect(cached.last?.createdAt == "2026-05-01T00:00:40.000Z")

    // Simulate an app restart: a fresh repository hydrates from the same
    // cache suite. The visible tail is the 40 newest cached messages, so the
    // load-earlier cursor must be the oldest of those -- a timestamp from
    // the original server window, not the moment the cache was rewritten.
    let relaunchClient = ScriptedPagedChatClient(
      pages: [
        "2026-05-01T00:00:01.000Z": MobileConversationDetailResponse(
          conversation: conversation, messages: [], hasMore: false
        ),
      ]
    )
    let relaunched = ChatRepository(
      client: relaunchClient, cache: cache, userID: userID, webBaseURL: url
    )
    await relaunched.bootstrap()

    #expect(relaunched.hasMoreOlder)
    await relaunched.loadOlderMessages()
    #expect(relaunchClient.lastFetchBefore == "2026-05-01T00:00:01.000Z")
  }

  // JOV-6210: persistCache round-trips the timeline through
  // MobileConversationMessage; createdAt must survive that round-trip so a
  // relaunched repository derives `olderCursor` from the server timestamp of
  // the oldest cached message, not the moment the cache was rewritten.
  @Test func loadOlderAfterRestartUsesOldestCachedServerTimestamp() async {
    let suite = "ie.jov.Jovie.tests.chat-repo-restart-older"
    let cache = ChatCache(defaults: UserDefaults(suiteName: suite)!)
    let cachedMessages = (1...45).map { index in
      MobileConversationMessage(
        id: "msg_\(index)",
        role: index.isMultiple(of: 2) ? "assistant" : "user",
        content: "Message \(index)",
        clientMessageId: "client_\(index)",
        turnId: "turn_\(index)",
        turnStatus: "completed",
        createdAt: "2026-05-01T00:00:\(String(format: "%02d", index)).000Z",
        requiresWebHandoff: false
      )
    }
    await cache.store(
      CachedChatSnapshot(
        conversations: [],
        messagesByConversationID: ["conv_restart": cachedMessages],
        cachedAt: Date(timeIntervalSince1970: 1_700_000_000),
        activeConversationID: "conv_restart"
      ),
      for: "user_repo_restart"
    )

    // First launch: paints the cached tail (messages 6...45), then load-earlier
    // fetches the page before the oldest visible message and persists.
    let oldestVisibleTimestamp = "2026-05-01T00:00:06.000Z"
    let firstClient = ScriptedPagedChatClient(
      pages: [
        oldestVisibleTimestamp: MobileConversationDetailResponse(
          conversation: MobileConversationRecord(
            id: "conv_restart",
            title: "Restart",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-01T00:00:00.000Z"
          ),
          messages: [
            MobileConversationMessage(
              id: "msg_5",
              role: "user",
              content: "Message 5",
              clientMessageId: "client_5",
              turnId: "turn_5",
              turnStatus: "completed",
              createdAt: "2026-05-01T00:00:05.000Z",
              requiresWebHandoff: false
            ),
          ],
          hasMore: true
        ),
      ]
    )
    let first = ChatRepository(
      client: firstClient,
      cache: cache,
      userID: "user_repo_restart",
      webBaseURL: URL(string: "https://preview.example")!
    )
    await first.bootstrap()
    #expect(first.timeline.map(\.content) == Array(6...45).map { "Message \($0)" })
    #expect(first.hasMoreOlder)

    await first.loadOlderMessages()
    #expect(firstClient.lastFetchBefore == oldestVisibleTimestamp)

    // Simulated restart: a fresh repository over the rewritten cache must
    // still page from the oldest message's server timestamp.
    let secondClient = ScriptedPagedChatClient(
      pages: [
        oldestVisibleTimestamp: MobileConversationDetailResponse(
          conversation: MobileConversationRecord(
            id: "conv_restart",
            title: "Restart",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-01T00:00:00.000Z"
          ),
          messages: [
            MobileConversationMessage(
              id: "msg_4",
              role: "assistant",
              content: "Message 4",
              clientMessageId: "client_4",
              turnId: "turn_4",
              turnStatus: "completed",
              createdAt: "2026-05-01T00:00:04.000Z",
              requiresWebHandoff: false
            ),
          ],
          hasMore: true
        ),
      ]
    )
    let relaunched = ChatRepository(
      client: secondClient,
      cache: cache,
      userID: "user_repo_restart",
      webBaseURL: URL(string: "https://preview.example")!
    )
    await relaunched.bootstrap()
    #expect(relaunched.hasMoreOlder)

    await relaunched.loadOlderMessages()

    #expect(secondClient.lastFetchBefore == oldestVisibleTimestamp)
    #expect(relaunched.timeline.first?.content == "Message 4")
    #expect(relaunched.isOffline == false)
  }

  @Test func sendInterruptsInFlightTurnWhenComposerSendsAgain() async {
    let client = GateableSendChatClient()
    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-interrupt")!),
      userID: "user_repo_interrupt",
      webBaseURL: URL(string: "https://preview.example")!
    )

    let firstSend = Task { await repository.send(text: "First") }
    // Time-bounded wait for the first send to start instead of a fixed yield
    // budget: under merge-queue runner load a fixed 50-iteration loop can
    // expire before the detached task reaches the client.
    let sendStartDeadline = Date().addingTimeInterval(10)
    while client.sendCount < 1, Date() < sendStartDeadline {
      await Task.yield()
    }
    #expect(repository.isSending)
    #expect(client.sendCount == 1)
    #expect(repository.timeline.map(\.content) == ["First", ""])

    await repository.send(text: "Steer")
    client.releaseSend()
    await firstSend.value

    #expect(client.sendCount == 2)
    #expect(repository.timeline.map(\.role) == [.user, .user, .assistant])
    // The replacement turn is the current generation, so its post-stream
    // guard applies: GateableSendChatClient returns no terminal event, and a
    // stream that finishes without one marks the assistant row failed
    // ("Summer did not confirm a terminal state for this turn.").
    #expect(
      repository.timeline.map(\.content) == [
        "First",
        "Steer",
        "Summer did not confirm a terminal state for this turn.",
      ]
    )
    #expect(repository.isSending == false)
  }

  @Test func refreshConversationsOn401SetsSessionExpiredNotOffline() async {
    let repository = ChatRepository(
      client: UnauthorizedChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-401-refresh")!),
      userID: "user_repo_401_refresh",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.refreshConversations()

    #expect(repository.isOffline == false)
    #expect(repository.sessionExpired == true)
    #expect(repository.lastErrorMessage == nil)
  }

  @Test func openConversationOn401SetsSessionExpiredNotOffline() async {
    let repository = ChatRepository(
      client: UnauthorizedChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-401-open")!),
      userID: "user_repo_401_open",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.openConversation("conv_401")

    #expect(repository.isOffline == false)
    #expect(repository.sessionExpired == true)
    #expect(repository.lastErrorMessage == nil)
    #expect(repository.activeConversationID == "conv_401")
  }

  @Test func sendOn401SetsSessionExpiredNotOffline() async {
    let repository = ChatRepository(
      client: UnauthorizedChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-401-send")!),
      userID: "user_repo_401_send",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "This should expire the session")

    #expect(repository.isOffline == false)
    #expect(repository.sessionExpired == true)
    #expect(repository.lastErrorMessage == nil)
    #expect(repository.timeline.last?.status == .failed)
    let assistant = repository.timeline.last { $0.role == .assistant }
    #expect(assistant?.status == .failed)
    #expect(assistant?.status != .completed)
    #expect(assistant?.content.contains("Jovie") == false)
  }

  @Test func terminalAuthFailureIsFailClosedFor401AndMissingToken() {
    #expect(isTerminalChatAuthFailure(APIClientError.missingToken))
    #expect(isTerminalChatAuthFailure(APIClientError.requestFailed(statusCode: 401)))
    #expect(isTerminalChatAuthFailure(MobileChatClientError.requestFailed(statusCode: 401)))
    #expect(isTerminalChatAuthFailure(MobileChatClientError.requestFailed(statusCode: 500)) == false)
    #expect(isTerminalChatAuthFailure(APIClientError.requestFailed(statusCode: 503)) == false)
  }

  @Test func retryOn401SetsSessionExpiredNotOffline() async {
    let repository = ChatRepository(
      client: UnauthorizedChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-401-retry")!),
      userID: "user_repo_401_retry",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Retry after 401")
    let originalClientTurnId = repository.timeline.first?.clientTurnId ?? ""
    #expect(originalClientTurnId.isEmpty == false)

    await repository.retry(clientTurnId: originalClientTurnId)

    #expect(repository.isOffline == false)
    #expect(repository.sessionExpired == true)
    #expect(repository.lastErrorMessage == nil)
  }

  @Test func refreshConversationsOn500MarksOfflineAndDoesNotExpireSession() async {
    let client = ScriptedChatClient(
      sendTurnResult: .failure(MobileChatClientError.transportFailed(code: -1009)),
      listConversationsResult: .failure(MobileChatClientError.requestFailed(statusCode: 500)),
      fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 500))
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-500-refresh")!),
      userID: "user_repo_500_refresh",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.refreshConversations()

    #expect(repository.isOffline == true)
    #expect(repository.sessionExpired == false)
  }

  @Test func seedAllComponentsFixtureKeepsWireContentAndSkipsNetworkRefresh() async {
    let repository = ChatRepository(
      client: FailingChatClient(),
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-all-components")!),
      userID: "user_repo_all_components",
      webBaseURL: URL(string: "https://preview.example")!
    )

    repository.seedTimelineForUITesting(
      MobileChatAllComponentsFixture.default,
      activeConversationID: MobileChatAllComponentsFixture.conversationID
    )
    await repository.refreshConversations()

    #expect(repository.activeConversationID == MobileChatAllComponentsFixture.conversationID)
    #expect(repository.timeline.count == MobileChatAllComponentsFixture.default.count)
    #expect(repository.timeline.contains { $0.content.contains("<tool_call>") })
    #expect(repository.timeline.contains { $0.status == .streaming && $0.content.isEmpty })
    #expect(repository.timeline.contains { $0.status == .failed })
    #expect(repository.timeline.contains { $0.requiresWebHandoff && $0.handoffURL != nil })
    #expect(repository.isOffline == false)
  }

  @Test func workspaceSendIncludesChatModeOnlyForOvie() async {
    func send(workspace: MobileWorkspaceMode, suite: String) async -> String? {
      let client = RecordingTurnChatClient()
      let repository = ChatRepository(
        client: client,
        cache: ChatCache(defaults: UserDefaults(suiteName: suite)!),
        userID: "user_repo_ws",
        webBaseURL: URL(string: "https://preview.example")!,
        workspace: workspace
      )
      await repository.send(text: "Need a taste decision")
      return client.lastRequest?.chatMode
    }
    #expect(await send(workspace: .ovie, suite: "ie.jov.Jovie.tests.chat-repo-ov-mode") == "ov")
    #expect(await send(workspace: .jovie, suite: "ie.jov.Jovie.tests.chat-repo-jovie-mode") == nil)
  }

  @Test func eyesFreeSubmitReusesIdempotencyKeyAndReadsBack() async {
    let client = RecordingTurnChatClient(
      eyesFreeResponse: eyesFreeResponse(
        destination: "jovie",
        status: "completed",
        conversationId: "conv_capture",
        turnId: "turn_capture",
        readback: "Here is a caption for Friday."
      )
    )
    let repository = eyesFreeRepository(client: client, suite: "eyes-free")
    let readback = await repository.submitEyesFreeCapture(
      transcript: "draft a drop",
      destination: .jovie,
      idempotencyKey: "turn_same_key"
    )
    #expect(readback == "Here is a caption for Friday.")
    #expect(client.lastEyesFreeRequest?.clientTurnId == "turn_same_key")
    #expect(client.lastEyesFreeRequest?.destination == "jovie")
    #expect(repository.activeConversationID == "conv_capture")
    #expect(repository.timeline.contains { $0.content == "Here is a caption for Friday." })
    _ = await repository.submitEyesFreeCapture(
      transcript: "draft a drop",
      destination: .jovie,
      idempotencyKey: "turn_same_key"
    )
    #expect(client.eyesFreeCallCount == 2)
    #expect(repository.timeline.filter { $0.role == .user }.count == 1)
  }

  @Test func eyesFreeSummerForbiddenDoesNotExpireSession() async {
    let client = RecordingTurnChatClient(
      eyesFreeResponse: eyesFreeResponse(
        destination: "summer",
        status: "forbidden",
        readback: "Summer is only available to the founder.",
        errorCode: "SUMMER_FORBIDDEN"
      )
    )
    let repository = eyesFreeRepository(client: client, suite: "summer-forbid")
    let readback = await repository.submitEyesFreeCapture(
      transcript: "what is blocked",
      destination: .summer,
      idempotencyKey: "turn_forbidden"
    )
    #expect(readback.contains("founder"))
    #expect(repository.sessionExpired == false)
    #expect(repository.isOffline == false)
    #expect(repository.timeline.contains { $0.status == .failed })
  }

  @Test func eyesFreeEmptyTranscriptDoesNotCallClient() async {
    let client = RecordingTurnChatClient(
      eyesFreeResponse: eyesFreeResponse(destination: "jovie", status: "completed", readback: "skip")
    )
    let repository = eyesFreeRepository(client: client, suite: "eyes-empty")
    let readback = await repository.submitEyesFreeCapture(
      transcript: "   ",
      destination: .jovie,
      idempotencyKey: "turn_empty_1"
    )
    #expect(readback == EyesFreeCaptureGate.transcriptionEmpty.message)
    #expect(client.eyesFreeCallCount == 0)
  }

  @Test func eyesFreeTransportFailureSurfacesRetryWithoutExpiringSession() async {
    let repository = eyesFreeRepository(client: FailingChatClient(), suite: "eyes-transport")
    let readback = await repository.submitEyesFreeCapture(
      transcript: "draft a drop",
      destination: .jovie,
      idempotencyKey: "turn_transport"
    )
    #expect(readback.isEmpty == false)
    #expect(repository.sessionExpired == false)
    #expect(repository.isOffline == true)
    #expect(repository.timeline.contains { $0.status == .failed })
  }

  @Test func ovieDurableSummerStatesCoverRedPathsAndResume() async {
    let url = URL(string: "https://preview.example")!
    func repo(_ suite: String, _ client: MobileChatClientProtocol) -> ChatRepository {
      ChatRepository(
        client: client,
        cache: ChatCache(defaults: UserDefaults(suiteName: suite)!),
        userID: "user_ov",
        webBaseURL: url,
        workspace: .ovie
      )
    }
    func scripted(_ events: Result<[MobileChatStreamEvent], Error>) -> ScriptedChatClient {
      ScriptedChatClient(
        sendTurnResult: events,
        listConversationsResult: .success([]),
        fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 404))
      )
    }
    let prompt = "Need a taste decision"
    let stale = repo("ie.jov.Jovie.tests.chat-ov-stale", scripted(.success([
      .turnReserved(conversationId: "conv_ov", turnId: "turn_ov", clientTurnId: "PLACEHOLDER"),
      .turnState(clientTurnId: "PLACEHOLDER", state: "queued", eveWorkId: "ini_eve_1"),
      .error(code: "SUMMER_TRANSPORT_FAILED", message: "Summer could not complete this turn."),
      .assistantCompleted(clientTurnId: "PLACEHOLDER", conversationId: "conv_ov", turnId: "turn_ov", text: "stale success"),
    ])))
    await stale.send(text: prompt)
    #expect(stale.timeline.last?.status == .failed && stale.timeline.last?.eveWorkId == "ini_eve_1")

    let order = repo("ie.jov.Jovie.tests.chat-ov-order", scripted(.success([
      .error(code: "SUMMER_TRANSPORT_FAILED", message: "terminal failure"),
      .assistantDelta(clientTurnId: "PLACEHOLDER", text: "late"),
    ])))
    await order.send(text: prompt)
    #expect(order.timeline.last?.content == "terminal failure")

    let dropped = repo("ie.jov.Jovie.tests.chat-ov-drop", scripted(.success([
      .turnState(clientTurnId: "PLACEHOLDER", state: "running", eveWorkId: "ini_eve_1"),
    ])))
    await dropped.send(text: prompt)
    #expect(dropped.timeline.last?.status == .failed)

    let conflict = repo("ie.jov.Jovie.tests.chat-ov-409", scripted(.failure(MobileChatClientError.requestFailed(statusCode: 409))))
    await conflict.send(text: prompt)
    #expect(conflict.timeline.last?.status == .retrying)

    let cache = ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-ov-resume")!)
    let first = ChatRepository(client: scripted(.success([
      .assistantCompleted(clientTurnId: "PLACEHOLDER", conversationId: "conv_ov", turnId: "turn_ov", text: "Summer reply"),
    ])), cache: cache, userID: "user_ov_resume", webBaseURL: url, workspace: .ovie)
    await first.send(text: prompt)
    let relaunched = ChatRepository(client: FailingChatClient(), cache: cache, userID: "user_ov_resume", webBaseURL: url, workspace: .ovie)
    await relaunched.bootstrap()
    #expect(relaunched.activeConversationID == "conv_ov")
    #expect(relaunched.timeline.filter { $0.content == "Summer reply" }.count == 1)
  }

  @Test func sendOnTransportFailureMarksOfflineAndDoesNotExpireSession() async {
    let client = ScriptedChatClient(
      sendTurnResult: .failure(MobileChatClientError.transportFailed(code: -1009)),
      listConversationsResult: .success([]),
      fetchConversationResult: .failure(MobileChatClientError.requestFailed(statusCode: 500))
    )

    let repository = ChatRepository(
      client: client,
      cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-500-send")!),
      userID: "user_repo_500_send",
      webBaseURL: URL(string: "https://preview.example")!
    )

    await repository.send(text: "Transport failed")

    #expect(repository.isOffline == true)
    #expect(repository.sessionExpired == false)
    #expect(repository.timeline.last?.status == .failed)
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

private final class RecordingTurnChatClient: MobileChatClientProtocol, @unchecked Sendable {
  private(set) var lastRequest: MobileChatTurnRequest?
  private(set) var lastEyesFreeRequest: EyesFreeCaptureAPIRequest?
  private(set) var eyesFreeCallCount = 0
  private let eyesFreeResponse: EyesFreeCaptureAPIResponse?

  init(eyesFreeResponse: EyesFreeCaptureAPIResponse? = nil) {
    self.eyesFreeResponse = eyesFreeResponse
  }

  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    throw MobileChatClientError.requestFailed(statusCode: 404)
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    lastRequest = request
    return []
  }

  func submitEyesFreeCapture(
    _ request: EyesFreeCaptureAPIRequest
  ) async throws -> EyesFreeCaptureAPIResponse {
    eyesFreeCallCount += 1
    lastEyesFreeRequest = request
    guard let eyesFreeResponse else { throw MobileChatClientError.invalidResponse }
    return eyesFreeResponse
  }
}

private struct SuccessfulChatClient: MobileChatClientProtocol {
  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
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

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    []
  }
}


private struct UnauthorizedChatClient: MobileChatClientProtocol {
  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    throw MobileChatClientError.requestFailed(statusCode: 401)
  }

  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    throw MobileChatClientError.requestFailed(statusCode: 401)
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    throw MobileChatClientError.requestFailed(statusCode: 401)
  }
}

private struct FailingChatClient: MobileChatClientProtocol {
  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    throw MobileChatClientError.requestFailed(statusCode: 500)
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    throw MobileChatClientError.transportFailed(code: -1009)
  }

  func submitEyesFreeCapture(
    _ request: EyesFreeCaptureAPIRequest
  ) async throws -> EyesFreeCaptureAPIResponse {
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
  private(set) var listConversationsCallCount = 0
  private(set) var fetchConversationCallCount = 0
  private(set) var lastFetchLimit: Int?
  private(set) var lastFetchBefore: String?

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
    listConversationsCallCount += 1
    return try listConversationsResult.get()
  }

  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    fetchConversationCallCount += 1
    lastFetchLimit = limit
    lastFetchBefore = before
    return try fetchConversationResult.get()
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    let events = try sendTurnResult.get().map { rewriteClientTurnId($0, to: request.clientTurnId) }
    if let onEvent {
      for event in events {
        await onEvent(event)
      }
    }
    return events
  }

  private func rewriteClientTurnId(
    _ event: MobileChatStreamEvent,
    to clientTurnId: String
  ) -> MobileChatStreamEvent {
    switch event {
    case let .turnReserved(conversationId, turnId, _):
      return .turnReserved(conversationId: conversationId, turnId: turnId, clientTurnId: clientTurnId)
    case let .turnState(_, state, eveWorkId):
      return .turnState(clientTurnId: clientTurnId, state: state, eveWorkId: eveWorkId)
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

/// Delivers completed stream events through `onEvent`, then fails the turn
/// the way a malformed later NDJSON line would.
private final class StreamingThenFailingChatClient: MobileChatClientProtocol, @unchecked Sendable {
  private let events: [MobileChatStreamEvent]

  init(events: [MobileChatStreamEvent]) {
    self.events = events
  }

  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    throw MobileChatClientError.requestFailed(statusCode: 500)
  }

  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    throw MobileChatClientError.requestFailed(statusCode: 404)
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    let delivered = events.map { event -> MobileChatStreamEvent in
      switch event {
      case let .turnReserved(conversationId, turnId, _):
        return .turnReserved(
          conversationId: conversationId,
          turnId: turnId,
          clientTurnId: request.clientTurnId
        )
      case let .assistantCompleted(_, conversationId, turnId, text):
        return .assistantCompleted(
          clientTurnId: request.clientTurnId,
          conversationId: conversationId,
          turnId: turnId,
          text: text
        )
      default:
        return event
      }
    }
    if let onEvent {
      for event in delivered {
        await onEvent(event)
      }
    }
    throw MobileChatClientError.decodingFailed
  }
}

private final class GateableFetchChatClient: MobileChatClientProtocol, @unchecked Sendable {
  private let detail: MobileConversationDetailResponse
  private var continuation: CheckedContinuation<Void, Never>?
  private var released = false
  private(set) var lastFetchLimit: Int?
  private(set) var lastFetchBefore: String?

  init(detail: MobileConversationDetailResponse) {
    self.detail = detail
  }

  func releaseFetch() {
    released = true
    continuation?.resume()
    continuation = nil
  }

  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    lastFetchLimit = limit
    lastFetchBefore = before
    if !released {
      await withCheckedContinuation { continuation in
        self.continuation = continuation
      }
    }
    return detail
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    []
  }
}

private final class ScriptedPagedChatClient: MobileChatClientProtocol, @unchecked Sendable {
  private let pages: [String?: MobileConversationDetailResponse]
  private(set) var lastFetchBefore: String?

  init(pages: [String?: MobileConversationDetailResponse]) {
    self.pages = pages
  }

  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    lastFetchBefore = before
    guard let page = pages[before] else {
      throw MobileChatClientError.requestFailed(statusCode: 404)
    }
    return page
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    []
  }
}

private final class GateableSendChatClient: MobileChatClientProtocol, @unchecked Sendable {
  private var continuation: CheckedContinuation<Void, Never>?
  private var released = false
  private(set) var sendCount = 0

  func releaseSend() {
    released = true
    continuation?.resume()
    continuation = nil
  }

  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    throw MobileChatClientError.requestFailed(statusCode: 404)
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    sendCount += 1
    if sendCount == 1, !released {
      await withCheckedContinuation { continuation in
        self.continuation = continuation
      }
    }
    return []
  }
}

@MainActor
private func eyesFreeRepository(
  client: MobileChatClientProtocol,
  suite: String
) -> ChatRepository {
  ChatRepository(
    client: client,
    cache: ChatCache(defaults: UserDefaults(suiteName: "ie.jov.Jovie.tests.chat-repo-\(suite)")!),
    userID: "user_repo_\(suite)",
    webBaseURL: URL(string: "https://preview.example")!
  )
}

private func eyesFreeResponse(
  destination: String,
  status: String,
  conversationId: String? = nil,
  turnId: String? = nil,
  readback: String,
  errorCode: String? = nil
) -> EyesFreeCaptureAPIResponse {
  EyesFreeCaptureAPIResponse(
    destination: destination,
    status: status,
    conversationId: conversationId,
    turnId: turnId,
    readback: readback,
    errorCode: errorCode
  )
}

/// Holds `fetchConversation` open until the test releases it, so cache-first
/// paint can be asserted while the network round trip is still in flight.
private final class GatedFetchChatClient: MobileChatClientProtocol, @unchecked Sendable {
  private let detail: MobileConversationDetailResponse
  private var continuation: CheckedContinuation<Void, Never>?
  private var fetchRequested = false
  private var released = false

  init(detail: MobileConversationDetailResponse) {
    self.detail = detail
  }

  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    []
  }

  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    fetchRequested = true
    if !released {
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        self.continuation = continuation
      }
    }
    return detail
  }

  func sendTurn(
    _ request: MobileChatTurnRequest,
    onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  ) async throws -> [MobileChatStreamEvent] {
    throw MobileChatClientError.requestFailed(statusCode: 500)
  }

  func waitUntilFetchRequested() async {
    let deadline = ContinuousClock.now.advanced(by: .seconds(2))
    while !fetchRequested, ContinuousClock.now < deadline {
      await Task.yield()
      try? await Task.sleep(for: .milliseconds(2))
    }
  }

  func releaseFetch() {
    released = true
    continuation?.resume()
    continuation = nil
  }
}

// Shared with AppState's discarded-repository receipt integration proof.
actor OwnedChatTestClient: MobileChatClientProtocol {
  let authorization: NativeRequestAuthorization
  let gate: ProfileLoadGate?
  let operation: String
  let beforeAuthorization: Bool
  let reportsOwner: Bool
  var failure: Error?
  var lateEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?
  var turnID = ""
  var dispatches = 0

  init(_ authorization: NativeRequestAuthorization, gate: ProfileLoadGate? = nil,
       operation: String = "send", beforeAuthorization: Bool = false, reportsOwner: Bool = true) {
    self.authorization = authorization; self.gate = gate
    self.operation = operation; self.beforeAuthorization = beforeAuthorization; self.reportsOwner = reportsOwner
  }
  func fail(with error: Error) { failure = error }
  func finish(_ operation: String) async throws {
    if self.operation == operation {
      if let gate { _ = await gate.wait() }
      if let failure { throw failure }
    }
  }
  func listConversations(limit: Int) async throws -> [MobileConversationSummary] {
    try await finish("list")
    return [MobileConversationSummary(id: "fresh", title: "Fresh", createdAt: "2026-01-01",
      updatedAt: "2026-01-01", latestMessageRole: "assistant", latestTurnStatus: "completed")]
  }
  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    try await finish(before == nil ? "detail" : "older")
    return MobileConversationDetailResponse(conversation: MobileConversationRecord(
      id: id, title: "Fresh", createdAt: "2026-01-01", updatedAt: "2026-01-01"),
      messages: ownedChatSnapshot("fresh").messagesByConversationID["thread"]!, hasMore: false)
  }
  func sendTurn(_ request: MobileChatTurnRequest,
                onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?) async throws -> [MobileChatStreamEvent] {
    try await sendTurn(request, onAuthorization: nil, onEvent: onEvent)
  }
  func sendTurn(_ request: MobileChatTurnRequest,
                onAuthorization: (@MainActor @Sendable (NativeSessionOwnership?) async throws -> Void)?,
                onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?) async throws -> [MobileChatStreamEvent] {
    if beforeAuthorization { try await finish("send") }
    try await onAuthorization?(reportsOwner ? authorization.ownership : nil)
    try await onAuthorization?(reportsOwner ? authorization.ownership : nil) // A same-owner retry must not duplicate rows.
    dispatches += 1
    turnID = request.clientTurnId; lateEvent = onEvent
    await onEvent?(.turnReserved(conversationId: "thread", turnId: "turn", clientTurnId: turnID))
    await onEvent?(.assistantDelta(clientTurnId: turnID, text: "painted"))
    await onEvent?(.turnState(clientTurnId: turnID, state: "streaming", eveWorkId: nil))
    if !beforeAuthorization, operation == "send", let gate { _ = await gate.wait() }
    await onEvent?(.assistantDelta(clientTurnId: turnID, text: " buffered"))
    if let failure { throw failure }
    return []
  }
  func flushLateEvents() async {
    // Flush through the real coalescer after completion, without a timer sleep.
    await lateEvent?(.turnState(clientTurnId: turnID, state: "streaming", eveWorkId: nil))
  }
  func submitEyesFreeCapture(_ request: EyesFreeCaptureAPIRequest) async throws -> EyesFreeCaptureAPIResponse {
    try await finish("eyes")
    return eyesFreeResponse(destination: "chat", status: "completed", conversationId: "thread", readback: "spoken")
  }
}

private func ownedChatSnapshot(_ text: String) -> CachedChatSnapshot {
  CachedChatSnapshot(conversations: [], messagesByConversationID: ["thread": [MobileConversationMessage(
    id: text, role: "assistant", content: text, clientMessageId: text, turnId: text,
    turnStatus: "completed", createdAt: "2026-01-01T00:00:00Z", requiresWebHandoff: false)]],
    cachedAt: Date(), activeConversationID: "thread", hasMoreOlderByConversationID: ["thread": true])
}

private actor HeldChatCache: ChatCaching {
  let base: ChatCache
  let loadGate: ProfileLoadGate?
  let storeGate: ProfileLoadGate?
  var loads = 0
  var writes = 0
  init(_ base: ChatCache, loadGate: ProfileLoadGate? = nil, storeGate: ProfileLoadGate? = nil) {
    self.base = base; self.loadGate = loadGate; self.storeGate = storeGate
  }
  func load(for userID: String, workspace: MobileWorkspaceMode) async -> CachedChatSnapshot? {
    loads += 1
    let snapshot = await base.load(for: userID, workspace: workspace)
    if loads == 1, let loadGate { _ = await loadGate.wait() }
    return snapshot
  }
  func store(_ snapshot: CachedChatSnapshot, for userID: String, workspace: MobileWorkspaceMode) async {
    writes += 1
    await base.store(snapshot, for: userID, workspace: workspace)
  }
  func store(_ snapshot: CachedChatSnapshot, for userID: String, workspace: MobileWorkspaceMode,
             ifOwnedBy ownership: NativeSessionOwnership) async -> Bool {
    if let storeGate { _ = await storeGate.wait() }
    writes += 1
    return await base.store(snapshot, for: userID, workspace: workspace, ifOwnedBy: ownership)
  }
}

@MainActor
private struct OwnedChatHarness {
  let suite = "owned-chat-\(UUID().uuidString)"
  let defaults: UserDefaults
  let cache: ChatCache
  let authorization: NativeRequestAuthorization
  init() throws {
    defaults = UserDefaults(suiteName: suite)!
    cache = ChatCache(defaults: defaults)
    NativeSessionTokenStore.save(token: "same-token", userID: "same-user", expiresAt: .distantFuture)
    authorization = try #require(NativeSessionTokenStore.requestAuthorization())
  }
  func cleanup() { defaults.removePersistentDomain(forName: suite); NativeSessionTokenStore.clear() }
  func replace() {
    NativeSessionTokenStore.save(token: "same-token", userID: "same-user", expiresAt: .distantFuture)
  }
  func repository(_ client: any MobileChatClientProtocol, cache: (any ChatCaching)? = nil,
                  workspace: MobileWorkspaceMode = .jovie,
                  sink: @escaping @MainActor (NativeSessionExpiryReceipt) async -> Void = { _ in }) -> ChatRepository {
    ChatRepository(client: client, cache: cache ?? self.cache, userID: "same-user",
      webBaseURL: URL(string: "https://jov.ie")!, workspace: workspace, activityDonator: nil,
      identity: NativeChatIdentity(userID: "same-user", ownership: authorization.ownership, workspace: workspace),
      onSessionExpired: sink)
  }
}

extension ChatRepositoryTests {
  @Test(arguments: ["list", "detail", "older", "send", "eyes"], [false, true])
  func ownedCompletionsRejectReplacementOrDeliverExpiryBeforeGuards(operation: String, expires: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      await h.cache.store(ownedChatSnapshot("cached"), for: "same-user")
      let gate = ProfileLoadGate()
      let client = OwnedChatTestClient(h.authorization, gate: gate, operation: operation)
      var receipts: [NativeSessionExpiryReceipt] = []
      let repository = h.repository(client) { receipts.append($0) }
      await repository.bootstrap()
      let task = Task {
        switch operation {
        case "list": await repository.refreshConversations()
        case "detail": await repository.openConversation("thread")
        case "older": await repository.loadOlderMessages()
        case "send": await repository.send(text: "prompt")
        default:
          #expect(await repository.submitEyesFreeCapture(transcript: "A complete thought", destination: .jovie,
            idempotencyKey: "voice") == "")
        }
        await gate.ownerFinished()
      }
      #expect(await gate.waitUntilEntered())
      let before = repository.timeline
      if expires {
        let receipt: NativeSessionExpiryReceipt
        do {
          receipt = try nativeExpiryReceipt {
            try NativeSessionTokenStore.resolveUnauthorized(authorizedBy: h.authorization, allowRetry: false)
          }
        } catch {
          await gate.complete(true); await task.value
          throw error
        }
        await client.fail(with: NativeSessionRequestError.expired(receipt))
        task.cancel() // Receipt authority must survive cancellation and selection changes.
        if operation == "detail" { repository.startNewConversation() }
      } else { h.replace() }
      let expected = NativeSessionTokenStore.captureSessionContext()
      await gate.complete(true); await task.value
      await client.flushLateEvents()
      #expect(receipts.count == (expires ? 1 : 0))
      #expect(!repository.isOffline && repository.lastErrorMessage == nil && !repository.sessionExpired)
      #expect(repository.timeline == (expires && operation == "detail" ? [] : before))
      #expect(await h.cache.load(for: "same-user")?.messagesByConversationID["thread"]?.first?.content == "cached")
      #expect(NativeSessionTokenStore.captureSessionContext() == expected)
    }
  }

  @Test(arguments: ["before", "throw", "return", "unmanaged"], [false, true])
  func publicSendCancellationForwardsToActualTaskAndNeverFlushesBufferedText(stage: String, replace: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      let gate = ProfileLoadGate()
      let client = OwnedChatTestClient(h.authorization, gate: gate, beforeAuthorization: stage == "before",
        reportsOwner: stage != "unmanaged")
      let cache = HeldChatCache(h.cache)
      let repository = h.repository(client, cache: cache)
      let task = Task { await repository.send(text: "prompt"); await gate.ownerFinished() }
      #expect(await gate.waitUntilEntered())
      let before = repository.timeline
      if replace { h.replace() }
      if stage == "throw" { await client.fail(with: CancellationError()) }
      task.cancel()
      await gate.complete(true); await task.value
      await client.flushLateEvents()
      #expect(await client.dispatches == (stage == "before" ? 0 : 1))
      #expect(repository.timeline.count == (stage == "before" ? 0 : 2))
      #expect(!repository.isOffline && repository.lastErrorMessage == nil)
      if stage != "before" {
        #expect(repository.timeline.last?.content == "painted")
        #expect(repository.timeline.last?.status == (replace || stage == "unmanaged" ? before.last?.status : .canceled))
      }
      #expect(await cache.writes == (stage != "before" && stage != "unmanaged" && !replace ? 1 : 0))
    }
  }

  @Test(arguments: [MobileWorkspaceMode.jovie, .ovie], [false, true])
  func actualOwnedCacheSinkPreservesReplacementMemoryAndDisk(workspace: MobileWorkspaceMode, replace: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      let gate = ProfileLoadGate()
      let cache = HeldChatCache(h.cache, storeGate: gate)
      let repository = h.repository(OwnedChatTestClient(h.authorization), cache: cache, workspace: workspace)
      let task = Task { await repository.refreshConversations(); await gate.ownerFinished() }
      #expect(await gate.waitUntilEntered())
      if replace {
        h.replace()
        await h.cache.store(ownedChatSnapshot("replacement"), for: "same-user", workspace: workspace)
      }
      await gate.complete(true); await task.value
      let warm = await h.cache.load(for: "same-user", workspace: workspace)
      let disk = await ChatCache(defaults: h.defaults).load(for: "same-user", workspace: workspace)
      #expect(warm == disk)
      #expect(warm?.conversations.first?.id == (replace ? nil : "fresh"))
      #expect(warm?.messagesByConversationID["thread"]?.first?.content == (replace ? "replacement" : nil))
    }
  }

  @Test(arguments: ["hydrate", "fallback", "persist", "eyes"])
  func ownershipIsRecheckedAfterCacheReadsAndBeforeSpokenReadback(stage: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      await h.cache.store(ownedChatSnapshot("old"), for: "same-user")
      let gate = ProfileLoadGate()
      let cache = HeldChatCache(h.cache, loadGate: gate)
      let client = OwnedChatTestClient(h.authorization, operation: "list")
      if stage == "fallback" { await client.fail(with: MobileChatClientError.transportFailed(code: -1009)) }
      let repository = h.repository(client, cache: cache)
      let task = Task {
        if stage == "hydrate" { await repository.bootstrap() }
        else if stage == "eyes" {
          #expect(await repository.submitEyesFreeCapture(transcript: "A complete thought", destination: .jovie,
            idempotencyKey: "voice") == "")
        } else { await repository.refreshConversations() }
        await gate.ownerFinished()
      }
      #expect(await gate.waitUntilEntered())
      let before = repository.timeline
      h.replace()
      await h.cache.store(ownedChatSnapshot("replacement"), for: "same-user")
      await gate.complete(true); await task.value
      #expect(repository.timeline == before)
      #expect(!repository.isOffline && repository.lastErrorMessage == nil)
      #expect(await cache.writes == 0)
      #expect(await h.cache.load(for: "same-user")?.messagesByConversationID["thread"]?.first?.content == "replacement")
    }
  }

  @Test func rootResolverReusesOnlyTheExactUserLoginAndWorkspace() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      var creations = 0
      @MainActor func make(_ identity: NativeChatIdentity) -> ChatRepository {
        creations += 1
        return ChatRepository(client: SuccessfulChatClient(), cache: h.cache, userID: identity.userID,
          webBaseURL: URL(string: "https://jov.ie")!, identity: identity)
      }
      let a = h.repository(SuccessfulChatClient())
      #expect(ChatRepository.resolve(a, for: a.identity, create: make) === a)
      let rotated = NativeChatIdentity(userID: "same-user", ownership: a.identity.ownership, workspace: .jovie)
      #expect(ChatRepository.resolve(a, for: rotated, create: make) === a)
      h.replace()
      let identities = [
        NativeChatIdentity(userID: "other-user", ownership: a.identity.ownership, workspace: .jovie),
        NativeChatIdentity(userID: "same-user", ownership: NativeSessionTokenStore.captureOwnership(), workspace: .jovie),
        NativeChatIdentity(userID: "same-user", ownership: a.identity.ownership, workspace: .ovie),
      ]
      for identity in identities { #expect(ChatRepository.resolve(a, for: identity, create: make) !== a) }
      #expect(creations == 3)
    }
  }
}

extension ChatRepositoryTests {
  @Test(arguments: ["throw", "return", "error"], ["current", "replacement", "thread", "draft"])
  func eyesFreeCancellationTerminatesOnlyTheCurrentOwnedTurn(stage: String, context: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      await h.cache.store(ownedChatSnapshot("cached"), for: "same-user")
      let gate = ProfileLoadGate()
      let cache = HeldChatCache(h.cache)
      let client = OwnedChatTestClient(h.authorization, gate: gate, operation: "eyes")
      let repository = h.repository(client, cache: cache)
      await repository.bootstrap()
      let task = Task {
        let readback = await repository.submitEyesFreeCapture(transcript: "A complete thought", destination: .jovie,
          idempotencyKey: "voice")
        await gate.ownerFinished()
        return readback
      }
      #expect(await gate.waitUntilEntered())
      #expect(repository.timeline.last?.status == .sending)
      if context == "replacement" {
        h.replace()
        await h.cache.store(ownedChatSnapshot("replacement"), for: "same-user")
      } else if context == "thread" {
        await repository.openConversation("thread-b")
      } else if context == "draft" {
        repository.startNewConversation()
      }
      let before = repository.timeline
      let activeBefore = repository.activeConversationID
      let cacheBefore = await h.cache.load(for: "same-user")
      let writesBefore = await cache.writes
      if stage != "return" { await client.fail(with: CancellationError()) }
      if stage != "error" { task.cancel() }
      await gate.complete(true)
      let readback = await task.value
      #expect(readback.isEmpty)
      #expect(!repository.isSending && !repository.isOffline && repository.lastErrorMessage == nil)
      #expect(repository.activeConversationID == activeBefore)
      #expect(await cache.writes == writesBefore + (context == "current" ? 1 : 0))
      let warm = await h.cache.load(for: "same-user")
      let disk = await ChatCache(defaults: h.defaults).load(for: "same-user")
      #expect(warm == disk)
      if context == "current" {
        #expect(repository.timeline.last?.status == .canceled)
        #expect(repository.timeline.filter { $0.role == .user }.last?.content == "A complete thought")
        #expect(!repository.timeline.contains { $0.status.isInFlight })
        #expect(warm?.messagesByConversationID["thread"]?.last?.turnStatus == "canceled")
      } else {
        #expect(repository.timeline == before)
        #expect(warm == cacheBefore)
      }
    }
  }

  @Test func eyesFreeCannotSpeakAfterTheActualOwnedStoreRejectsReplacement() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      let gate = ProfileLoadGate()
      let cache = HeldChatCache(h.cache, storeGate: gate)
      let repository = h.repository(OwnedChatTestClient(h.authorization), cache: cache)
      let task = Task {
        let result = await repository.submitEyesFreeCapture(transcript: "A complete thought", destination: .jovie,
          idempotencyKey: "voice")
        await gate.ownerFinished()
        return result
      }
      #expect(await gate.waitUntilEntered())
      h.replace()
      await h.cache.store(ownedChatSnapshot("replacement"), for: "same-user")
      await gate.complete(true)
      #expect(await task.value == "")
      #expect(await ChatCache(defaults: h.defaults).load(for: "same-user")?.messagesByConversationID["thread"]?.first?.content == "replacement")
    }
  }

  @Test func oldEyesFreePersistenceCannotAssembleNewTypedTurnOrClearItsSendingMarker() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      let cacheGate = ProfileLoadGate()
      let sendGate = ProfileLoadGate()
      let cache = HeldChatCache(h.cache, loadGate: cacheGate)
      let client = OwnedChatTestClient(h.authorization, gate: sendGate)
      let repository = h.repository(client, cache: cache)
      let voice = Task {
        let result = await repository.submitEyesFreeCapture(transcript: "A complete thought", destination: .jovie,
          idempotencyKey: "voice")
        await cacheGate.ownerFinished()
        return result
      }
      #expect(await cacheGate.waitUntilEntered())
      let typed = Task { await repository.send(text: "new typed turn"); await sendGate.ownerFinished() }
      #expect(await sendGate.waitUntilEntered())
      await cacheGate.complete(true)
      #expect(await voice.value == "")
      #expect(repository.isSending)
      #expect(await cache.writes == 0)
      await sendGate.complete(true); await typed.value
      #expect(!repository.isSending)
      #expect(await cache.writes == 1)
    }
  }
}

extension ChatRepositoryTests {
  @Test(arguments: [false, true])
  func heldAuthorizationCannotAppendIntoAnotherThreadOrAReplacementEmptyDraft(newDraft: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      let gate = ProfileLoadGate()
      let client = OwnedChatTestClient(h.authorization, gate: gate, beforeAuthorization: true)
      let repository = h.repository(client)
      if !newDraft { await repository.openConversation("thread-a") }
      let task = Task { await repository.send(text: "old prompt"); await gate.ownerFinished() }
      #expect(await gate.waitUntilEntered())
      if newDraft { repository.startNewConversation() }
      else { await repository.openConversation("thread-b") }
      let before = repository.timeline
      let cacheBefore = await h.cache.load(for: "same-user")
      await gate.complete(true); await task.value
      #expect(await client.dispatches == 0)
      #expect(repository.timeline == before)
      #expect(repository.activeConversationID == (newDraft ? nil : "thread-b"))
      #expect(await h.cache.load(for: "same-user") == cacheBefore)
      #expect(!repository.isOffline && repository.lastErrorMessage == nil)
    }
  }
}

extension ChatRepositoryTests {
  @Test(arguments: [false, true])
  func unmanagedFixture401CannotGrantAnOwnedRepositoryExpiryAuthority(send: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      var receipts = 0
      let repository = h.repository(UnauthorizedChatClient()) { _ in receipts += 1 }
      if send { await repository.send(text: "prompt") }
      else { await repository.refreshConversations() }
      #expect(receipts == 0 && !repository.sessionExpired)
      #expect(NativeSessionTokenStore.requestAuthorization() == h.authorization)
    }
  }
}

extension ChatRepositoryTests {
  @Test(arguments: [false, true])
  func heldEyesFreeResponseCannotReplaceAnotherThreadOrNewDraft(newDraft: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      let gate = ProfileLoadGate()
      let repository = h.repository(OwnedChatTestClient(h.authorization, gate: gate, operation: "eyes"))
      let task = Task {
        let result = await repository.submitEyesFreeCapture(transcript: "A complete thought", destination: .jovie,
          idempotencyKey: "voice")
        await gate.ownerFinished()
        return result
      }
      #expect(await gate.waitUntilEntered())
      if newDraft { repository.startNewConversation() }
      else { await repository.openConversation("thread-b") }
      let before = repository.timeline
      let cacheBefore = await h.cache.load(for: "same-user")
      await gate.complete(true)
      #expect(await task.value == "")
      #expect(repository.timeline == before)
      #expect(repository.activeConversationID == (newDraft ? nil : "thread-b"))
      #expect(await h.cache.load(for: "same-user") == cacheBefore)
      #expect(!repository.isOffline && repository.lastErrorMessage == nil)
    }
  }
}

extension ChatRepositoryTests {
  @Test(arguments: ["failed", "canceled"],
        ["cancel-before", "replace-before", "reject-before", "cancel-held", "replace-held", "reject-held"])
  func retryKeepsOriginalRowsUntilAdmission(status: String, stage: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      let snapshot = retryAdmissionSnapshot(status)
      await h.cache.store(snapshot, for: "same-user")
      let gate = ProfileLoadGate()
      let held = stage.hasSuffix("held")
      let client = RetryAdmissionClient(h.authorization, before: held ? [0: gate] : [:])
      if stage.hasPrefix("reject") { await client.reject(with: MobileChatClientError.transportFailed(code: -1009)) }
      let repository = h.repository(client)
      await repository.bootstrap()
      let original = repository.timeline
      if stage == "replace-before" { h.replace() }
      let task = Task {
        if stage == "cancel-before" { withUnsafeCurrentTask { $0?.cancel() } }
        await repository.retry(clientTurnId: "original")
        await gate.ownerFinished()
      }
      let entered = await gate.waitUntilEntered()
      let whileHeld = repository.timeline
      if stage == "cancel-held" { task.cancel() }
      if stage == "replace-held" { h.replace() }
      await gate.complete(true); await task.value
      let warm = await h.cache.load(for: "same-user")
      let disk = await ChatCache(defaults: h.defaults).load(for: "same-user")
      #expect(entered == held)
      #expect(whileHeld == original && repository.timeline == original)
      #expect(warm == snapshot && disk == snapshot)
      #expect(await client.requests.isEmpty)
      #expect(await client.attempts == (stage == "cancel-before" || stage == "replace-before" ? 0 : 1))
      #expect(!repository.isSending && !repository.isOffline && repository.lastErrorMessage == nil)
      if stage == "cancel-held" {
        // A rejected attempt releases its duplicate reservation for a later valid retry.
        await repository.retry(clientTurnId: "original")
        #expect(await client.requests.count == 1)
        #expect(repository.timeline.count == 2 && repository.timeline.first?.clientTurnId != "original")
      }
    }
  }

  @Test(arguments: ["thread", "draft", "round-trip", "same-thread"])
  func heldRetryCannotDeleteRowsAfterSelectionOrContentReplacement(change: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      await h.cache.store(retryAdmissionSnapshot("failed"), for: "same-user")
      let gate = ProfileLoadGate()
      let client = RetryAdmissionClient(h.authorization, before: [0: gate])
      let repository = h.repository(client)
      await repository.bootstrap()
      let original = repository.timeline
      let task = Task { await repository.retry(clientTurnId: "original"); await gate.ownerFinished() }
      let entered = await gate.waitUntilEntered()
      let beforeChange = repository.timeline
      if change == "thread" { await repository.openConversation("thread-b") }
      else if change == "same-thread" { await repository.openConversation("thread") }
      else {
        repository.startNewConversation()
        if change == "round-trip" { await repository.bootstrap() }
      }
      let selected = repository.timeline
      let activeID = repository.activeConversationID
      let cache = await h.cache.load(for: "same-user")
      await gate.complete(true); await task.value
      #expect(entered && beforeChange == original)
      #expect(await client.requests.isEmpty)
      #expect(repository.timeline == selected && repository.activeConversationID == activeID)
      #expect(await h.cache.load(for: "same-user") == cache)
      #expect(await ChatCache(defaults: h.defaults).load(for: "same-user") == cache)
      #expect(!repository.isSending && !repository.isOffline && repository.lastErrorMessage == nil)
      if change == "same-thread" { #expect(repository.timeline.first?.content == "Replacement user row") }
      if change == "round-trip" { #expect(repository.timeline == original) }
    }
  }

  @Test(arguments: ["failed", "canceled"])
  func duplicateRetryAdmitsOneFreshTurnAndAuthorizationCallbackIsIdempotent(status: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      await h.cache.store(retryAdmissionSnapshot(status), for: "same-user")
      let firstGate = ProfileLoadGate(), duplicateGate = ProfileLoadGate()
      let client = RetryAdmissionClient(h.authorization, before: [0: firstGate, 1: duplicateGate])
      let repository = h.repository(client)
      await repository.bootstrap()
      let original = repository.timeline
      let first = Task { await repository.retry(clientTurnId: "original"); await firstGate.ownerFinished() }
      let firstEntered = await firstGate.waitUntilEntered()
      let duplicate = Task { await repository.retry(clientTurnId: "original"); await duplicateGate.ownerFinished() }
      let duplicateEntered = await duplicateGate.waitUntilEntered()
      let heldRows = repository.timeline
      await firstGate.complete(true); await duplicateGate.complete(true)
      await first.value; await duplicate.value
      let requests = await client.requests
      let turnID = try #require(requests.first?.clientTurnId)
      #expect(firstEntered && !duplicateEntered)
      #expect(heldRows == original)
      #expect(await client.attempts == 1)
      #expect(requests.count == 1 && requests.first?.text == "Retry me")
      #expect(turnID != "original")
      #expect(repository.timeline.count == 2)
      #expect(repository.timeline.allSatisfy { $0.clientTurnId == turnID })
      #expect(repository.timeline.first?.content == "Retry me")
      #expect(repository.timeline.last?.content == "answer-0" && repository.timeline.last?.status == .completed)
      #expect(!repository.isSending)
      let warm = await h.cache.load(for: "same-user")
      let disk = await ChatCache(defaults: h.defaults).load(for: "same-user")
      #expect(warm == disk)
      #expect(warm?.messagesByConversationID["thread"]?.map(\.clientMessageId) == [turnID, turnID])
    }
  }

  @Test func retryOfAnotherFailedTurnStillInterruptsAnActiveSend() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      await h.cache.store(retryAdmissionSnapshot("failed"), for: "same-user")
      let sendingGate = ProfileLoadGate(), retryGate = ProfileLoadGate()
      let client = RetryAdmissionClient(h.authorization, before: [1: retryGate], after: [0: sendingGate])
      let cache = HeldChatCache(h.cache)
      let repository = h.repository(client, cache: cache)
      await repository.bootstrap()
      let original = repository.timeline
      let sending = Task { await repository.send(text: "Another turn"); await sendingGate.ownerFinished() }
      let sendEntered = await sendingGate.waitUntilEntered()
      let retry = Task { await repository.retry(clientTurnId: "original"); await retryGate.ownerFinished() }
      let retryEntered = await retryGate.waitUntilEntered()
      let beforeAdmission = repository.timeline
      await sendingGate.complete(true); await sending.value
      let stillSending = repository.isSending
      let writesBeforeAdmission = await cache.writes
      await retryGate.complete(true); await retry.value
      let requests = await client.requests
      #expect(sendEntered && retryEntered && stillSending)
      #expect(Array(beforeAdmission.prefix(2)) == original)
      #expect(beforeAdmission.last?.status == .completed && beforeAdmission.last?.content == "painted-0")
      let writesAfterAdmission = await cache.writes
      #expect(writesBeforeAdmission == 0 && writesAfterAdmission == 1)
      #expect(requests.map(\.text) == ["Another turn", "Retry me"])
      #expect(Set(requests.map(\.clientTurnId)).count == 2)
      #expect(repository.timeline.count == 4 && !repository.timeline.contains { $0.clientTurnId == "original" })
      let interrupted = repository.timeline.dropFirst().first
      #expect(interrupted?.content == "painted-0" && interrupted?.status == .completed)
      #expect(repository.timeline.last?.content == "answer-1" && repository.timeline.last?.status == .completed)
      #expect(!repository.isSending && !repository.isOffline && repository.lastErrorMessage == nil)
      let warm = await h.cache.load(for: "same-user")
      let disk = await ChatCache(defaults: h.defaults).load(for: "same-user")
      #expect(warm == disk)
      #expect(warm?.messagesByConversationID["thread"]?.count == 4)
    }
  }

  @Test(arguments: [false, true])
  func rejectedRetryDeliversExpiryBeforeCancellationAndSelectionGuards(newDraft: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = try OwnedChatHarness(); defer { h.cleanup() }
      let snapshot = retryAdmissionSnapshot("failed")
      await h.cache.store(snapshot, for: "same-user")
      let gate = ProfileLoadGate()
      let client = RetryAdmissionClient(h.authorization, before: [0: gate])
      var receipts: [NativeSessionExpiryReceipt] = []
      let repository = h.repository(client) { receipts.append($0) }
      await repository.bootstrap()
      let original = repository.timeline
      let task = Task { await repository.retry(clientTurnId: "original"); await gate.ownerFinished() }
      let entered = await gate.waitUntilEntered()
      let beforeExpiry = repository.timeline
      let receipt: NativeSessionExpiryReceipt
      do {
        receipt = try nativeExpiryReceipt {
          try NativeSessionTokenStore.resolveUnauthorized(authorizedBy: h.authorization, allowRetry: false)
        }
      } catch {
        await gate.complete(true); await task.value
        throw error
      }
      await client.reject(with: NativeSessionRequestError.expired(receipt))
      task.cancel()
      if newDraft { repository.startNewConversation() }
      await gate.complete(true); await task.value
      #expect(entered && beforeExpiry == original)
      #expect(receipts == [receipt])
      #expect(await client.requests.isEmpty)
      #expect(repository.timeline == (newDraft ? [] : original))
      #expect(await h.cache.load(for: "same-user") == snapshot)
      #expect(await ChatCache(defaults: h.defaults).load(for: "same-user") == snapshot)
      #expect(!repository.isSending && !repository.isOffline && repository.lastErrorMessage == nil)
    }
  }
}

private func retryAdmissionSnapshot(_ status: String, userText: String = "Retry me") -> CachedChatSnapshot {
  let messages = [
    MobileConversationMessage(id: "original-user", role: "user", content: userText,
      clientMessageId: "original", turnId: "old-turn", turnStatus: "completed",
      createdAt: "2026-01-01T00:00:00Z", requiresWebHandoff: false),
    MobileConversationMessage(id: "original-assistant", role: "assistant", content: "Original answer",
      clientMessageId: "original", turnId: "old-turn", turnStatus: status,
      createdAt: "2026-01-01T00:00:01Z", requiresWebHandoff: false),
  ]
  return CachedChatSnapshot(conversations: [], messagesByConversationID: ["thread": messages],
    cachedAt: Date(timeIntervalSince1970: 1), activeConversationID: "thread")
}

// Each attempted call has a distinct, completion-aware gate. An incorrect duplicate
// can enter its own gate without overwriting the first call's continuation.
private actor RetryAdmissionClient: MobileChatClientProtocol {
  let authorization: NativeRequestAuthorization
  let before: [Int: ProfileLoadGate]
  let after: [Int: ProfileLoadGate]
  var attempts = 0
  var requests: [MobileChatTurnRequest] = []
  private var rejection: Error?
  init(_ authorization: NativeRequestAuthorization, before: [Int: ProfileLoadGate] = [:],
       after: [Int: ProfileLoadGate] = [:]) {
    self.authorization = authorization; self.before = before; self.after = after
  }
  func reject(with error: Error) { rejection = error }
  func listConversations(limit: Int) async throws -> [MobileConversationSummary] { [] }
  func fetchConversation(id: String, limit: Int, before: String?) async throws -> MobileConversationDetailResponse {
    MobileConversationDetailResponse(conversation: MobileConversationRecord(id: id, title: "Replacement",
      createdAt: "2026-01-01", updatedAt: "2026-01-01"),
      messages: retryAdmissionSnapshot("failed", userText: "Replacement user row").messagesByConversationID["thread"]!,
      hasMore: false)
  }
  func sendTurn(_ request: MobileChatTurnRequest,
                onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?) async throws -> [MobileChatStreamEvent] {
    try await sendTurn(request, onAuthorization: nil, onEvent: onEvent)
  }
  func sendTurn(_ request: MobileChatTurnRequest,
                onAuthorization: (@MainActor @Sendable (NativeSessionOwnership?) async throws -> Void)?,
                onEvent: (@Sendable (MobileChatStreamEvent) async -> Void)?) async throws -> [MobileChatStreamEvent] {
    let index = attempts; attempts += 1
    if let gate = before[index] { _ = await gate.wait() }
    if let rejection { throw rejection }
    try await onAuthorization?(authorization.ownership)
    try await onAuthorization?(authorization.ownership)
    requests.append(request)
    await onEvent?(.turnReserved(conversationId: "thread", turnId: "turn-\(index)", clientTurnId: request.clientTurnId))
    await onEvent?(.assistantDelta(clientTurnId: request.clientTurnId, text: "painted-\(index)"))
    await onEvent?(.turnState(clientTurnId: request.clientTurnId, state: "streaming", eveWorkId: nil))
    if let gate = after[index] { _ = await gate.wait() }
    await onEvent?(.assistantCompleted(clientTurnId: request.clientTurnId, conversationId: "thread",
      turnId: "turn-\(index)", text: "answer-\(index)"))
    return []
  }
}
