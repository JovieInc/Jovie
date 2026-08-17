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
}
