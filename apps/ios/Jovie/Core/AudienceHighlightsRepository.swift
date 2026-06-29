import Foundation

struct AudienceHighlightsRepositoryResult: Equatable, Sendable {
  let response: MobileAudienceHighlightsResponse
  let isStale: Bool
}

protocol AudienceHighlightsRepositoryProtocol: Sendable {
  func load(for clerkUserID: String) async throws -> AudienceHighlightsRepositoryResult
}

struct AudienceHighlightsRepository: AudienceHighlightsRepositoryProtocol, Sendable {
  private let apiClient: APIClientProtocol

  init(apiClient: APIClientProtocol) {
    self.apiClient = apiClient
  }

  func load(for _: String) async throws -> AudienceHighlightsRepositoryResult {
    let response = try await apiClient.fetchAudienceHighlights()
    return AudienceHighlightsRepositoryResult(response: response, isStale: false)
  }
}

struct PreviewAudienceHighlightsRepository: AudienceHighlightsRepositoryProtocol, Sendable {
  func load(for _: String) async throws -> AudienceHighlightsRepositoryResult {
    AudienceHighlightsRepositoryResult(response: .preview, isStale: false)
  }
}