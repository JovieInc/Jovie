import Foundation

struct MeRepositoryResult: Equatable, Sendable {
  let response: MobileMeResponse
  let isStale: Bool
}

protocol MeRepositoryProtocol: Sendable {
  func loadMe(for userID: String) async throws -> MeRepositoryResult
  func cachedSnapshot(for userID: String) async -> MobileMeResponse?
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
  func cachedSnapshot(for userID: String) async -> MobileMeResponse? {
    await cache.load(for: userID)?.response
  }

  func loadMe(for userID: String) async throws -> MeRepositoryResult {
    do {
      let response = try await apiClient.fetchMe()
      await cache.store(response, for: userID)
      return MeRepositoryResult(response: response, isStale: false)
    } catch let error as APIClientError
      where error == .missingToken || error == .requestFailed(statusCode: 401)
    {
      // Auth failures must surface so AppState can sign out. Stale cache is
      // only a fallback for transport / 5xx / decode failures.
      throw error
    } catch {
      if let cached = await cache.load(for: userID) {
        return MeRepositoryResult(response: cached.response, isStale: true)
      }
      throw error
    }
  }

  func clearCachedUser(_ userID: String) async {
    await cache.remove(for: userID)
  }
}
