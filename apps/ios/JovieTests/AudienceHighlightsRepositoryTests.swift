import Foundation
import Testing
@testable import Jovie

private actor MutableAudienceHighlightsAPIClient: APIClientProtocol {
  var mode: Mode

  enum Mode {
    case success(MobileAudienceHighlightsResponse)
    case failure(Error)
  }

  init(mode: Mode) {
    self.mode = mode
  }

  func fetchMe() async throws -> MobileMeResponse { .previewReady }

  func fetchAppleWalletProfilePass() async throws -> Data { Data() }

  func fetchAudienceHighlights() async throws -> MobileAudienceHighlightsResponse {
    switch mode {
    case let .success(response):
      return response
    case let .failure(error):
      throw error
    }
  }

  func fetchActionLoopInbox() async throws -> MobileActionLoopInboxResponse {
    .preview
  }

  func fetchActionLoopCalendar() async throws -> MobileActionLoopCalendarResponse {
    .preview
  }

  func updateMode(_ mode: Mode) {
    self.mode = mode
  }
}

struct AudienceHighlightsRepositoryTests {
  @Test func loadsAudienceHighlightsFromAPI() async throws {
    let defaults = UserDefaults(suiteName: "AudienceHighlightsRepositoryTests-load")!
    defaults.removePersistentDomain(forName: "AudienceHighlightsRepositoryTests-load")
    let repository = AudienceHighlightsRepository(
      apiClient: MutableAudienceHighlightsAPIClient(mode: .success(.preview)),
      cache: AudienceHighlightsCache(defaults: defaults)
    )

    let result = try await repository.load(for: "user_123")

    #expect(result.response == .preview)
    #expect(result.isStale == false)
  }

  @Test func successStoresSnapshot() async throws {
    let suiteName = "AudienceHighlightsRepositoryTests-store"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let cache = AudienceHighlightsCache(defaults: defaults)
    let repository = AudienceHighlightsRepository(
      apiClient: MutableAudienceHighlightsAPIClient(mode: .success(.preview)),
      cache: cache
    )

    let result = try await repository.load(for: "user_store")

    #expect(result.isStale == false)
    #expect(result.response == .preview)
    let cached = await cache.load(for: "user_store")
    #expect(cached?.response == .preview)
  }

  @Test func returnsStaleWhenNetworkFailsWithCache() async throws {
    let suiteName = "AudienceHighlightsRepositoryTests-stale"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let cache = AudienceHighlightsCache(defaults: defaults)
    let apiClient = MutableAudienceHighlightsAPIClient(mode: .success(.preview))
    let repository = AudienceHighlightsRepository(apiClient: apiClient, cache: cache)

    _ = try await repository.load(for: "user_stale")
    await apiClient.updateMode(.failure(APIClientError.requestFailed(statusCode: 500)))

    let staleResult = try await repository.load(for: "user_stale")

    #expect(staleResult.isStale == true)
    #expect(staleResult.response == .preview)
  }

  @Test func throwsWhenNetworkFailsWithoutCache() async throws {
    let suiteName = "AudienceHighlightsRepositoryTests-empty"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let repository = AudienceHighlightsRepository(
      apiClient: MutableAudienceHighlightsAPIClient(
        mode: .failure(APIClientError.requestFailed(statusCode: 500))
      ),
      cache: AudienceHighlightsCache(defaults: defaults)
    )

    await #expect(throws: APIClientError.requestFailed(statusCode: 500)) {
      try await repository.load(for: "user_empty")
    }
  }
}

struct AudienceHighlightsLoadingPolicyTests {
  @Test func doesNotShowLoadingWhenAlreadyLoaded() {
    #expect(
      audienceHighlightsShouldShowLoading(current: .loaded(.preview)) == false
    )
    #expect(audienceHighlightsShouldShowLoading(current: .idle))
    #expect(audienceHighlightsShouldShowLoading(current: .loading))
    #expect(audienceHighlightsShouldShowLoading(current: .error("Couldn't load")))
  }
}

private let otherActionLoopInbox = MobileActionLoopInboxResponse(
  pendingCount: 2,
  items: [],
  emptyActionCards: [],
  chatPrompt: "other-inbox"
)

private let otherActionLoopCalendar = MobileActionLoopCalendarResponse(
  rangeLabel: "Other",
  pendingReviewCount: 0,
  upcomingEvents: [],
  pendingEvents: [],
  upcomingReleases: [],
  chatPrompt: "other-calendar"
)

struct ActionLoopCacheTests {
  @Test func storeInboxThenLoadInboxReturnsSnapshot() async {
    let suiteName = "ActionLoopCacheTests-inbox-roundtrip"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let cache = ActionLoopCache(defaults: defaults)

    await cache.storeInbox(.preview, for: "user_inbox")

    #expect(await cache.loadInbox(for: "user_inbox") == .preview)
  }

  @Test func storeCalendarThenLoadCalendarReturnsSnapshot() async {
    let suiteName = "ActionLoopCacheTests-calendar-roundtrip"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let cache = ActionLoopCache(defaults: defaults)

    await cache.storeCalendar(.preview, for: "user_calendar")

    #expect(await cache.loadCalendar(for: "user_calendar") == .preview)
  }

  @Test func persistedSnapshotsSurviveNewCacheInstance() async {
    let suiteName = "ActionLoopCacheTests-persist"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)

    let writer = ActionLoopCache(defaults: defaults)
    await writer.storeInbox(.preview, for: "user_persist")
    await writer.storeCalendar(.preview, for: "user_persist")

    let reader = ActionLoopCache(defaults: defaults)
    #expect(await reader.loadInbox(for: "user_persist") == .preview)
    #expect(await reader.loadCalendar(for: "user_persist") == .preview)
  }

  @Test func differentUserDoesNotSeeOtherUsersSnapshot() async {
    let suiteName = "ActionLoopCacheTests-user-keyed"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let cache = ActionLoopCache(defaults: defaults)

    await cache.storeInbox(.preview, for: "user_a")
    await cache.storeCalendar(.preview, for: "user_a")
    await cache.storeInbox(otherActionLoopInbox, for: "user_b")
    await cache.storeCalendar(otherActionLoopCalendar, for: "user_b")

    #expect(await cache.loadInbox(for: "user_a") == .preview)
    #expect(await cache.loadCalendar(for: "user_a") == .preview)
    #expect(await cache.loadInbox(for: "user_b") == otherActionLoopInbox)
    #expect(await cache.loadCalendar(for: "user_b") == otherActionLoopCalendar)

    let reader = ActionLoopCache(defaults: defaults)
    #expect(await reader.loadInbox(for: "user_a") == .preview)
    #expect(await reader.loadInbox(for: "user_b") == otherActionLoopInbox)
    #expect(await reader.loadCalendar(for: "user_a") == .preview)
    #expect(await reader.loadCalendar(for: "user_b") == otherActionLoopCalendar)
  }

  @Test func failedDiskDecodeKeepsInMemorySnapshot() async {
    let suiteName = "ActionLoopCacheTests-fail-keeps-snapshot"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let cache = ActionLoopCache(defaults: defaults)

    await cache.storeInbox(.preview, for: "user_keep")
    await cache.storeCalendar(.preview, for: "user_keep")

    defaults.set(Data("not-json".utf8), forKey: "ie.jov.Jovie.actionLoopInbox.user_keep")
    defaults.set(Data("not-json".utf8), forKey: "ie.jov.Jovie.actionLoopCalendar.user_keep")

    #expect(await cache.loadInbox(for: "user_keep") == .preview)
    #expect(await cache.loadCalendar(for: "user_keep") == .preview)

    let reader = ActionLoopCache(defaults: defaults)
    #expect(await reader.loadInbox(for: "user_keep") == nil)
    #expect(await reader.loadCalendar(for: "user_keep") == nil)
  }

  @Test func ovieInboxCacheDoesNotCollideWithArtistInbox() async {
    let suiteName = "ActionLoopCacheTests-workspace-isolation"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let cache = ActionLoopCache(defaults: defaults)

    await cache.storeInbox(.preview, for: "user_ws", workspace: .jovie)
    await cache.storeInbox(otherActionLoopInbox, for: "user_ws", workspace: .ovie)

    #expect(await cache.loadInbox(for: "user_ws", workspace: .jovie) == .preview)
    #expect(await cache.loadInbox(for: "user_ws", workspace: .ovie) == otherActionLoopInbox)
    #expect(defaults.data(forKey: "ie.jov.Jovie.actionLoopInbox.user_ws") != nil)
    #expect(defaults.data(forKey: "ie.jov.Jovie.actionLoopInbox.user_ws.ov") != nil)
  }
}

/// Transport intentionally ignores cancellation, as a completion already
/// delivered by URLSession can. Tests control each independent response.
private actor SuspendedHomeDataClient: MobileHomeDataClient {
  enum Surface: Hashable { case audience, calendar, inbox }
  private var audience: CheckedContinuation<MobileAudienceHighlightsResponse, Error>?
  private var calendar: CheckedContinuation<MobileActionLoopCalendarResponse, Error>?
  private var inbox: CheckedContinuation<MobileActionLoopInboxResponse, Error>?
  private var startWaiters: [CheckedContinuation<Void, Never>] = []
  private var surfaceWaiters: [Surface: [CheckedContinuation<Void, Never>]] = [:]
  private var decision: CheckedContinuation<Void, Error>?
  private var decisionWaiters: [CheckedContinuation<Void, Never>] = []
  private var decisionStarted = false
  private(set) var started: Set<Surface> = []
  private(set) var requestedWorkspace: MobileWorkspaceMode?

  private func didStart(_ surface: Surface) {
    started.insert(surface)
    let surfaceWaiting = surfaceWaiters.removeValue(forKey: surface) ?? []
    for waiter in surfaceWaiting { waiter.resume() }
    if started.count == 3 {
      let waiters = startWaiters
      startWaiters = []
      for waiter in waiters { waiter.resume() }
    }
  }

  func waitForAllRequests() async {
    guard started.count < 3 else { return }
    await withCheckedContinuation { startWaiters.append($0) }
  }

  func waitForRequest(_ surface: Surface) async {
    guard !started.contains(surface) else { return }
    await withCheckedContinuation { surfaceWaiters[surface, default: []].append($0) }
  }

  func failInbox() {
    inbox?.resume(throwing: APIClientError.transportFailed(code: -1009))
    inbox = nil
  }

  func submitDecision() async throws {
    try await withCheckedThrowingContinuation {
      decision = $0
      decisionStarted = true
      let waiters = decisionWaiters
      decisionWaiters = []
      for waiter in waiters { waiter.resume() }
    }
  }

  func waitForDecision() async {
    guard !decisionStarted else { return }
    await withCheckedContinuation { decisionWaiters.append($0) }
  }

  func acceptDecision() {
    decision?.resume(returning: ())
    decision = nil
  }

  func fetchAudienceHighlights() async throws -> MobileAudienceHighlightsResponse {
    try await withCheckedThrowingContinuation {
      audience = $0
      didStart(.audience)
    }
  }

  func fetchActionLoopCalendar() async throws -> MobileActionLoopCalendarResponse {
    try await withCheckedThrowingContinuation {
      calendar = $0
      didStart(.calendar)
    }
  }

  func fetchActionLoopInbox(workspace: MobileWorkspaceMode) async throws -> MobileActionLoopInboxResponse {
    requestedWorkspace = workspace
    return try await withCheckedThrowingContinuation {
      inbox = $0
      didStart(.inbox)
    }
  }

  func finishInbox(_ response: MobileActionLoopInboxResponse = .preview) {
    inbox?.resume(returning: response)
    inbox = nil
  }

  func finishRemaining() {
    audience?.resume(returning: .preview)
    calendar?.resume(returning: .preview)
    finishInbox()
    audience = nil
    calendar = nil
  }

  func failAll() {
    audience?.resume(throwing: APIClientError.transportFailed(code: -1009))
    calendar?.resume(throwing: APIClientError.transportFailed(code: -1009))
    inbox?.resume(throwing: APIClientError.transportFailed(code: -1009))
    audience = nil
    calendar = nil
    inbox = nil
  }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct MobileHomeDataStoreTests {
  private func decisionInbox() -> MobileActionLoopInboxResponse {
    MobileActionLoopInboxResponse(
      pendingCount: 1,
      items: [MobileActionLoopInboxItem(
        id: "summer-card:card-1", typeLabel: "Approval", createdAt: "2026-10-02T00:00:00Z",
        title: "Review", why: "Pending review", primaryActionLabel: "Approve", status: "pending"
      )],
      emptyActionCards: [], chatPrompt: "Review my inbox"
    )
  }

  @Test(arguments: [false, true])
  func acceptedDecisionStillSucceedsAfterContextChanges(changesAccount: Bool) async {
    let store = MobileHomeDataStore(defaults: makeDefaults())
    store.setContext(userID: "artist", workspace: .ovie)
    let client = SuspendedHomeDataClient()
    let decision = Task {
      await store.decideSummerCard("card-1", userID: "artist", workspace: .ovie) {
        try await client.submitDecision()
      }
    }
    await client.waitForDecision()
    store.setContext(
      userID: changesAccount ? "other-artist" : "artist",
      workspace: changesAccount ? .ovie : .jovie
    )
    let newInbox = decisionInbox()
    store.showFixture(audience: .loaded(.preview), calendar: .preview, inbox: newInbox)
    await client.acceptDecision()
    #expect(await decision.value, "A successful server operation remains successful after context changes")
    #expect(store.inbox == newInbox, "The old decision must not alter the new context's inbox")
  }

  @Test func failedDecisionReturnsFalseWithoutRemovingInboxCards() async {
    let store = MobileHomeDataStore(defaults: makeDefaults())
    store.setContext(userID: "artist", workspace: .ovie)
    let inbox = decisionInbox()
    store.showFixture(audience: .loaded(.preview), calendar: .preview, inbox: inbox)
    let accepted = await store.decideSummerCard("card-1", userID: "artist", workspace: .ovie) {
      throw APIClientError.transportFailed(code: -1009)
    }
    #expect(accepted == false)
    #expect(store.inbox == inbox)
  }

  @Test func acceptedDecisionRemovesAndCachesTheCurrentContextCard() async {
    let defaults = makeDefaults()
    let store = MobileHomeDataStore(defaults: defaults)
    store.setContext(userID: "artist", workspace: .ovie)
    store.showFixture(audience: .loaded(.preview), calendar: .preview, inbox: decisionInbox())
    let accepted = await store.decideSummerCard("card-1", userID: "artist", workspace: .ovie) {}
    #expect(accepted)
    #expect(store.inbox?.items.isEmpty == true)
    #expect(store.inbox?.pendingCount == 0)
    let cached = await ActionLoopCache(defaults: defaults).loadInbox(for: "artist", workspace: .ovie)
    #expect(cached == store.inbox)
  }

  private func makeDefaults() -> UserDefaults {
    UserDefaults(suiteName: "MobileHomeDataStoreTests-\(UUID().uuidString)")!
  }

  private func waitForInbox(_ store: MobileHomeDataStore) async {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: .seconds(2))
    while store.inbox == nil, clock.now < deadline {
      try? await Task.sleep(for: .milliseconds(1))
    }
    #expect(store.inbox != nil, "Inbox must publish before the other requests finish")
  }

  @Test func inboxPublishesWithoutWaitingForAudienceOrCalendar() async {
    let store = MobileHomeDataStore(defaults: makeDefaults())
    let client = SuspendedHomeDataClient()
    let refresh = Task { await store.reload(userID: "artist", workspace: .jovie, client: client) }
    await client.waitForAllRequests()
    #expect(store.audienceState == .loading)
    #expect(store.isLoadingCalendar)
    #expect(store.isLoadingInbox)
    await client.finishInbox()
    await waitForInbox(store)
    #expect(store.inbox == .preview)
    #expect(store.isLoadingInbox == false)
    #expect(store.calendar == nil)
    #expect(store.audienceState == .loading)
    await client.finishRemaining()
    await refresh.value
    #expect(store.calendar == .preview)
    #expect(store.audienceState == .loaded(.preview))
  }

  @Test func cachedSnapshotsPaintWhileAllRequestsAreSuspendedAndSurviveFailure() async {
    let defaults = makeDefaults()
    let cache = ActionLoopCache(defaults: defaults)
    await cache.storeInbox(.preview, for: "artist")
    await cache.storeCalendar(.preview, for: "artist")
    await AudienceHighlightsCache(defaults: defaults).store(.preview, for: "artist")
    let store = MobileHomeDataStore(defaults: defaults)
    let client = SuspendedHomeDataClient()
    let refresh = Task { await store.reload(userID: "artist", workspace: .jovie, client: client) }
    await client.waitForAllRequests()
    #expect(store.inbox == .preview)
    #expect(store.calendar == .preview)
    #expect(store.audienceState == .loaded(.preview))
    #expect(store.isLoadingInbox == false)
    #expect(store.isLoadingCalendar == false)
    await client.failAll()
    await refresh.value
    #expect(store.inbox == .preview)
    #expect(store.calendar == .preview)
    #expect(store.audienceState == .loaded(.preview))
  }

  @Test func duplicateRetryDoesNotStartAnotherFlight() async {
    let store = MobileHomeDataStore(defaults: makeDefaults())
    let client = SuspendedHomeDataClient()
    let duplicate = SuspendedHomeDataClient()
    let refresh = Task { await store.reload(userID: "artist", workspace: .jovie, client: client) }
    await client.waitForAllRequests()
    await store.reload(userID: "artist", workspace: .jovie, client: duplicate)
    #expect(await duplicate.started.isEmpty)
    await client.finishRemaining()
    await refresh.value
  }

  @Test func signOutRejectsLateResultsAndCacheWrites() async {
    let defaults = makeDefaults()
    let store = MobileHomeDataStore(defaults: defaults)
    let client = SuspendedHomeDataClient()
    let refresh = Task { await store.reload(userID: "artist", workspace: .jovie, client: client) }
    await client.waitForAllRequests()
    store.setContext(userID: nil, workspace: .jovie)
    await client.finishRemaining()
    await refresh.value
    #expect(store.inbox == nil)
    #expect(store.calendar == nil)
    #expect(store.audienceState == .idle)
    #expect(store.isLoadingInbox == false)
    #expect(store.isLoadingCalendar == false)
    let cache = ActionLoopCache(defaults: defaults)
    #expect(await cache.loadInbox(for: "artist") == nil)
    #expect(await cache.loadCalendar(for: "artist") == nil)
    #expect(await AudienceHighlightsCache(defaults: defaults).load(for: "artist") == nil)
  }

  @Test func workspaceChangeRejectsOldFlightWithoutClearingNewLoadingState() async {
    let store = MobileHomeDataStore(defaults: makeDefaults())
    let oldClient = SuspendedHomeDataClient()
    let newClient = SuspendedHomeDataClient()
    let oldRefresh = Task { await store.reload(userID: "artist", workspace: .jovie, client: oldClient) }
    await oldClient.waitForAllRequests()
    store.setContext(userID: "artist", workspace: .ovie)
    let newRefresh = Task { await store.reload(userID: "artist", workspace: .ovie, client: newClient) }
    await newClient.waitForAllRequests()
    await oldClient.finishRemaining()
    await oldRefresh.value
    #expect(store.inbox == nil)
    #expect(store.calendar == nil)
    #expect(store.isLoadingInbox)
    #expect(store.isLoadingCalendar)
    #expect(await newClient.requestedWorkspace == .ovie)
    await newClient.finishRemaining()
    await newRefresh.value
    #expect(store.inbox == .preview)
  }

  @Test func cancellationStopsLatePaintAndAllowsRetry() async {
    let store = MobileHomeDataStore(defaults: makeDefaults())
    let client = SuspendedHomeDataClient()
    let refresh = Task { await store.reload(userID: "artist", workspace: .jovie, client: client) }
    await client.waitForAllRequests()
    refresh.cancel()
    await client.finishRemaining()
    await refresh.value
    #expect(store.inbox == nil)
    #expect(store.calendar == nil)
    #expect(store.audienceState == .idle)
    #expect(store.isLoadingInbox == false)
    let retryClient = SuspendedHomeDataClient()
    let retry = Task { await store.reload(userID: "artist", workspace: .jovie, client: retryClient) }
    await retryClient.waitForAllRequests()
    await retryClient.finishRemaining()
    await retry.value
    #expect(store.inbox == .preview)
  }

  @Test func emptyCacheFailureFinishesLoadingAndShowsAudienceError() async {
    let store = MobileHomeDataStore(defaults: makeDefaults())
    let client = SuspendedHomeDataClient()
    let refresh = Task { await store.reload(userID: "artist", workspace: .jovie, client: client) }
    await client.waitForAllRequests()
    await client.failAll()
    await refresh.value
    #expect(store.inbox == nil)
    #expect(store.calendar == nil)
    #expect(store.isLoadingInbox == false)
    #expect(store.isLoadingCalendar == false)
    #expect(store.audienceState == .error("Couldn't load audience highlights."))
  }
  @Test func accountChangeClearsSnapshotsBeforeTheNewAccountFinishes() async {
    let store = MobileHomeDataStore(defaults: makeDefaults())
    let client = SuspendedHomeDataClient()
    let first = Task { await store.reload(userID: "first", workspace: .jovie, client: client) }
    await client.waitForAllRequests()
    await client.finishRemaining()
    await first.value
    #expect(store.inbox == .preview)
    store.setContext(userID: "second", workspace: .jovie)
    #expect(store.inbox == nil)
    #expect(store.calendar == nil)
    #expect(store.audienceState == .idle)
    let secondClient = SuspendedHomeDataClient()
    let second = Task { await store.reload(userID: "second", workspace: .jovie, client: secondClient) }
    await secondClient.waitForAllRequests()
    #expect(store.inbox == nil)
    await secondClient.failAll()
    await second.value
    #expect(store.inbox == nil)
  }

  @Test func staleRefreshCannotResurrectADecidedCardOrDecrementTheCountTwice() async {
    let defaults = makeDefaults()
    let snapshot = MobileActionLoopInboxResponse(
      pendingCount: 1,
      items: [MobileActionLoopInboxItem(
        id: "summer-card:card-1", typeLabel: "Approval", createdAt: "2026-10-02T00:00:00Z",
        title: "Review", why: "Pending review", primaryActionLabel: "Approve", status: "pending"
      )],
      emptyActionCards: [], chatPrompt: "Review my inbox"
    )
    await ActionLoopCache(defaults: defaults).storeInbox(snapshot, for: "artist", workspace: .ovie)
    let store = MobileHomeDataStore(defaults: defaults)
    let client = SuspendedHomeDataClient()
    let refresh = Task { await store.reload(userID: "artist", workspace: .ovie, client: client) }
    await client.waitForAllRequests()
    #expect(store.inbox == snapshot)
    await store.removeDecidedCard("card-1", userID: "artist", workspace: .ovie)
    #expect(store.inbox?.items.isEmpty == true)
    #expect(store.inbox?.pendingCount == 0)
    await client.finishInbox(snapshot)
    await client.finishRemaining()
    await refresh.value
    #expect(store.inbox?.items.isEmpty == true)
    #expect(store.inbox?.pendingCount == 0)
    await store.removeDecidedCard("card-1", userID: "artist", workspace: .ovie)
    #expect(store.inbox?.pendingCount == 0)
    let persisted = await ActionLoopCache(defaults: defaults).loadInbox(for: "artist", workspace: .ovie)
    #expect(persisted == store.inbox)
    // A decision from an old account/workspace cannot change the active inbox.
    await store.removeDecidedCard("action-1", userID: "other", workspace: .jovie)
    #expect(store.inbox == persisted)
  }

  @Test func cancelledRequestCannotReplaceTheCurrentContext() async {
    let store = MobileHomeDataStore(defaults: makeDefaults())
    store.setContext(userID: "current", workspace: .jovie)
    store.showFixture(audience: .loaded(.preview), calendar: .preview, inbox: .preview)
    let client = SuspendedHomeDataClient()
    let cancelled = Task { await store.reload(userID: "old", workspace: .ovie, client: client) }
    cancelled.cancel()
    await cancelled.value
    #expect(await client.started.isEmpty)
    #expect(store.audienceState == .loaded(.preview))
    #expect(store.inbox == .preview)
    #expect(store.calendar == .preview)
  }

  @Test func failedInboxCanRetryWhileOtherSurfacesAreStillLoading() async {
    let store = MobileHomeDataStore(defaults: makeDefaults())
    let client = SuspendedHomeDataClient()
    let first = Task { await store.reload(userID: "artist", workspace: .jovie, client: client) }
    await client.waitForAllRequests()
    await client.failInbox()
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: .seconds(2))
    while store.isLoadingInbox, clock.now < deadline {
      try? await Task.sleep(for: .milliseconds(1))
    }
    #expect(store.isLoadingInbox == false)
    #expect(store.audienceState == .loading)
    #expect(store.isLoadingCalendar)
    let retryClient = SuspendedHomeDataClient()
    let retry = Task { await store.reload(userID: "artist", workspace: .jovie, client: retryClient) }
    await retryClient.waitForRequest(.inbox)
    #expect(await retryClient.started == [.inbox])
    await retryClient.finishInbox()
    await retry.value
    #expect(store.inbox == .preview)
    #expect(store.isLoadingCalendar)
    #expect(store.audienceState == .loading)
    await client.finishRemaining()
    await first.value
    #expect(store.inbox == .preview)
  }

}
