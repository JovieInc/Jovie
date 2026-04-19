import Foundation
import Testing
@testable import Jovie

private actor MutableAPIClient: APIClientProtocol {
  var mode: Mode

  enum Mode {
    case success(MobileMeResponse)
    case failure(Error)
  }

  init(mode: Mode) {
    self.mode = mode
  }

  func fetchMe() async throws -> MobileMeResponse {
    switch mode {
    case let .success(response):
      return response
    case let .failure(error):
      throw error
    }
  }

  func updateMode(_ mode: Mode) {
    self.mode = mode
  }
}

struct MeRepositoryTests {
  @Test func returnsFreshDataAndCachesIt() async throws {
    let cache = MeCache(defaults: UserDefaults(suiteName: "MeRepositoryTests-A")!)
    let apiClient = MutableAPIClient(mode: .success(.previewReady))
    let repository = MeRepository(apiClient: apiClient, cache: cache)

    let result = try await repository.loadMe(for: "user_123")

    #expect(result.isStale == false)
    #expect(result.response == .previewReady)
    let cached = await cache.load(for: "user_123")
    #expect(cached?.response == .previewReady)
  }

  @Test func returnsStaleSnapshotWhenNetworkFails() async throws {
    let defaults = UserDefaults(suiteName: "MeRepositoryTests-B")!
    defaults.removePersistentDomain(forName: "MeRepositoryTests-B")
    let cache = MeCache(defaults: defaults)
    let liveClient = MutableAPIClient(mode: .success(.previewReady))
    let repository = MeRepository(apiClient: liveClient, cache: cache)

    _ = try await repository.loadMe(for: "user_456")
    await liveClient.updateMode(.failure(APIClientError.requestFailed(statusCode: 500)))

    let staleResult = try await repository.loadMe(for: "user_456")

    #expect(staleResult.isStale == true)
    #expect(staleResult.response == .previewReady)
  }
}
