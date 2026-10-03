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
  private let cache: any MeCaching

  init(apiClient: APIClientProtocol, cache: any MeCaching) {
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
    try await loadMe(for: userID, ownership: nil)
  }

  func loadMe(for userID: String, ifOwnedBy ownership: NativeSessionOwnership) async throws
    -> MeRepositoryResult
  {
    try await loadMe(for: userID, ownership: ownership)
  }

  private func loadMe(for userID: String, ownership: NativeSessionOwnership?) async throws
    -> MeRepositoryResult
  {
    do {
      let response: MobileMeResponse
      if let ownership {
        response = try await apiClient.fetchMe(for: userID, ifOwnedBy: ownership)
        try Task.checkCancellation()
        _ = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: ownership, for: userID)
        let committed = await cache.store(response, for: userID, ifOwnedBy: ownership)
        _ = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: ownership, for: userID)
        guard committed else { throw NativeSessionRequestError.superseded }
        try Task.checkCancellation()
      } else {
        response = try await apiClient.fetchMe()
        await cache.store(response, for: userID)
      }
      return MeRepositoryResult(response: response, isStale: false)
    } catch let error as NativeSessionRequestError {
      throw error
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as APIClientError
      where error == .missingToken || error == .requestFailed(statusCode: 401)
    {
      // Auth failures must surface so AppState can sign out. Stale cache is
      // only a fallback for transport / 5xx / decode failures.
      throw error
    } catch {
      let cached = await cache.load(for: userID)
      if let ownership {
        _ = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: ownership, for: userID)
        try Task.checkCancellation()
      }
      if let cached {
        return MeRepositoryResult(response: cached.response, isStale: true)
      }
      throw error
    }
  }

  func clearCachedUser(_ userID: String) async {
    await cache.remove(for: userID)
  }

  func clearCachedUser(_ userID: String, ifOwnedBy ownership: NativeSessionOwnership) async {
    await cache.remove(for: userID, ifOwnedBy: ownership)
  }
}
