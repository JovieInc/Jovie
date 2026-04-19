import Foundation
import Testing
@testable import Jovie

private actor MockRepository: AppStateRepository {
  var nextResult: Result<MeRepositoryResult, Error>

  init(nextResult: Result<MeRepositoryResult, Error>) {
    self.nextResult = nextResult
  }

  func loadMe(for clerkUserID: String) async throws -> MeRepositoryResult {
    try nextResult.get()
  }
}

private final class MockBrightnessController: BrightnessControlling, @unchecked Sendable {
  func setMaxBrightness() async {}
  func restoreBrightness() async {}
}

@MainActor
struct AppStateTests {
  private let configuration = AppConfiguration(
    clerkPublishableKey: "pk_test_123",
    apiBaseURL: URL(string: "http://localhost:3100")!,
    webBaseURL: URL(string: "https://jov.ie")!
  )

  @Test func mapsReadyResponseToReadyRoute() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didLoadClerk = true

    await appState.handleSignedInUserChange("user_123")

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
  }

  @Test func mapsNeedsOnboardingResponseToNeedsOnboardingRoute() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewNeedsOnboarding, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didLoadClerk = true

    await appState.handleSignedInUserChange("user_123")

    #expect(appState.route == .needsOnboarding)
  }
}
