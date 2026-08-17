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