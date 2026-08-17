import Foundation

struct AudienceHighlightsRepositoryResult: Equatable, Sendable {
  let response: MobileAudienceHighlightsResponse
  let isStale: Bool
}

struct CachedAudienceHighlightsSnapshot: Codable, Equatable, Sendable {
  let response: MobileAudienceHighlightsResponse
  let cachedAt: Date
}

actor AudienceHighlightsCache {
  private var memory: [String: CachedAudienceHighlightsSnapshot] = [:]
  private let defaults: UserDefaults
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func load(for userID: String) -> CachedAudienceHighlightsSnapshot? {
    if let snapshot = memory[userID] {
      return snapshot
    }

    guard
      let data = defaults.data(forKey: cacheKey(for: userID)),
      let snapshot = try? decoder.decode(CachedAudienceHighlightsSnapshot.self, from: data)
    else {
      return nil
    }

    memory[userID] = snapshot
    return snapshot
  }

  func store(_ response: MobileAudienceHighlightsResponse, for userID: String) {
    let snapshot = CachedAudienceHighlightsSnapshot(response: response, cachedAt: Date())
    memory[userID] = snapshot
    if let data = try? encoder.encode(snapshot) {
      defaults.set(data, forKey: cacheKey(for: userID))
    }
  }

  func remove(for userID: String) {
    memory[userID] = nil
    defaults.removeObject(forKey: cacheKey(for: userID))
  }

  private func cacheKey(for userID: String) -> String {
    "ie.jov.Jovie.audienceHighlights.\(userID)"
  }
}

protocol AudienceHighlightsRepositoryProtocol: Sendable {
  func load(for userID: String) async throws -> AudienceHighlightsRepositoryResult
  func cachedSnapshot(for userID: String) async -> MobileAudienceHighlightsResponse?
}

struct AudienceHighlightsRepository: AudienceHighlightsRepositoryProtocol, Sendable {
  private let apiClient: APIClientProtocol
  private let cache: AudienceHighlightsCache

  init(apiClient: APIClientProtocol, cache: AudienceHighlightsCache) {
    self.apiClient = apiClient
    self.cache = cache
  }

  func cachedSnapshot(for userID: String) async -> MobileAudienceHighlightsResponse? {
    await cache.load(for: userID)?.response
  }

  func load(for userID: String) async throws -> AudienceHighlightsRepositoryResult {
    do {
      let response = try await apiClient.fetchAudienceHighlights()
      await cache.store(response, for: userID)
      return AudienceHighlightsRepositoryResult(response: response, isStale: false)
    } catch {
      if let cached = await cache.load(for: userID) {
        return AudienceHighlightsRepositoryResult(response: cached.response, isStale: true)
      }
      throw error
    }
  }
}

struct PreviewAudienceHighlightsRepository: AudienceHighlightsRepositoryProtocol, Sendable {
  func load(for _: String) async throws -> AudienceHighlightsRepositoryResult {
    AudienceHighlightsRepositoryResult(response: .preview, isStale: false)
  }

  func cachedSnapshot(for _: String) async -> MobileAudienceHighlightsResponse? {
    .preview
  }
}
