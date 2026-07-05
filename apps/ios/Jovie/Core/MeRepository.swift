import Foundation

struct MeRepositoryResult: Equatable, Sendable {
  let response: MobileMeResponse
  let isStale: Bool
}

protocol MeRepositoryProtocol: Sendable {
  func loadMe(for clerkUserID: String) async throws -> MeRepositoryResult
  func cachedSnapshot(for clerkUserID: String) async -> MobileMeResponse?
}

struct MeRepository: MeRepositoryProtocol, Sendable {
  private let apiClient: APIClientProtocol
  private let cache: MeCache

  init(apiClient: APIClientProtocol, cache: MeCache) {
    self.apiClient = apiClient
    self.cache = cache
  }

  /// Returns the last persisted profile for this user without touching the
  /// network. Used to paint the dashboard instantly on launch while a fresh
  /// copy is revalidated in the background (stale-while-revalidate).
  func cachedSnapshot(for clerkUserID: String) async -> MobileMeResponse? {
    await cache.load(for: clerkUserID)?.response
  }

  func loadMe(for clerkUserID: String) async throws -> MeRepositoryResult {
    do {
      let response = try await apiClient.fetchMe()
      await cache.store(response, for: clerkUserID)
      return MeRepositoryResult(response: response, isStale: false)
    } catch {
      if let cached = await cache.load(for: clerkUserID) {
        return MeRepositoryResult(response: cached.response, isStale: true)
      }
      throw error
    }
  }

  func clearCachedUser(_ clerkUserID: String) async {
    await cache.remove(for: clerkUserID)
  }
}
