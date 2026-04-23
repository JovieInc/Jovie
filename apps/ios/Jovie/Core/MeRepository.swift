import Foundation

struct MeRepositoryResult: Equatable, Sendable {
  let response: MobileMeResponse
  let isStale: Bool
}

protocol MeRepositoryProtocol: Sendable {
  func loadMe(for clerkUserID: String) async throws -> MeRepositoryResult
}

struct MeRepository: MeRepositoryProtocol, Sendable {
  private let apiClient: APIClientProtocol
  private let cache: MeCache

  init(apiClient: APIClientProtocol, cache: MeCache) {
    self.apiClient = apiClient
    self.cache = cache
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
}
