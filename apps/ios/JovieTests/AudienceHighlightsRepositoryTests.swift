import Foundation
import Testing
@testable import Jovie

private actor MockAudienceHighlightsAPIClient: APIClientProtocol {
  let response: MobileAudienceHighlightsResponse
  let error: Error?

  init(
    response: MobileAudienceHighlightsResponse = .preview,
    error: Error? = nil
  ) {
    self.response = response
    self.error = error
  }

  func fetchMe() async throws -> MobileMeResponse { .previewReady }

  func fetchAppleWalletProfilePass() async throws -> Data { Data() }

  func fetchAudienceHighlights() async throws -> MobileAudienceHighlightsResponse {
    if let error {
      throw error
    }
    return response
  }

  func fetchActionLoopInbox() async throws -> MobileActionLoopInboxResponse {
    .preview
  }

  func fetchActionLoopCalendar() async throws -> MobileActionLoopCalendarResponse {
    .preview
  }
}

struct AudienceHighlightsRepositoryTests {
  @Test func loadsAudienceHighlightsFromAPI() async throws {
    let repository = AudienceHighlightsRepository(
      apiClient: MockAudienceHighlightsAPIClient(response: .preview)
    )

    let result = try await repository.load(for: "user_123")

    #expect(result.response == .preview)
    #expect(result.isStale == false)
  }
}