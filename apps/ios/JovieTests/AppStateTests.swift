import Foundation
import Testing
@testable import Jovie

private actor MockRepository: AppStateRepository {
  var nextResult: Result<MeRepositoryResult, Error>
  private var clearedUserIDs: [String] = []
  private var loadCallCount = 0
  private let loadDelay: Duration?

  init(nextResult: Result<MeRepositoryResult, Error>, loadDelay: Duration? = nil) {
    self.nextResult = nextResult
    self.loadDelay = loadDelay
  }

  func loadMe(for clerkUserID: String) async throws -> MeRepositoryResult {
    loadCallCount += 1
    if let loadDelay {
      try await Task.sleep(for: loadDelay)
    }
    return try nextResult.get()
  }

  func clearCachedUser(_ clerkUserID: String) {
    clearedUserIDs.append(clerkUserID)
  }

  func clearedUsers() -> [String] {
    clearedUserIDs
  }

  func loadCount() -> Int {
    loadCallCount
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

  @Test func signOutResetsRouteAndClearsActiveUserCache() async throws {
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
    await appState.signOut()

    #expect(appState.route == .signedOut)
    #expect(appState.dashboardState == .idle)
    #expect(appState.activeUserID == nil)
    #expect(appState.isOffline == false)
    #expect(await repository.clearedUsers() == ["user_123"])
  }

  @Test func duplicateSignedInUserLoadIsIgnoredWhileInFlight() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      ),
      loadDelay: .milliseconds(50)
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didLoadClerk = true

    async let first: Void = appState.handleSignedInUserChange("user_123")
    async let second: Void = appState.handleSignedInUserChange("user_123")
    _ = await (first, second)

    #expect(await repository.loadCount() == 1)
    #expect(appState.route == .ready)
  }

  @Test func signOutIgnoresInFlightProfileLoad() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      ),
      loadDelay: .milliseconds(50)
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didLoadClerk = true

    async let load: Void = appState.handleSignedInUserChange("user_123")
    try await Task.sleep(for: .milliseconds(10))
    await appState.signOut()
    _ = await load

    #expect(appState.route == .signedOut)
    #expect(appState.dashboardState == .idle)
    #expect(appState.activeUserID == nil)
    #expect(await repository.clearedUsers() == ["user_123"])
  }

  @Test func authFormInputNormalizesEmailAndCode() {
    #expect(AuthFormInput.normalizedEmail("  TIM@JOV.IE\n") == "tim@jov.ie")
    #expect(AuthFormInput.normalizedCode("12 3-4567") == "123456")
  }

  @Test func authFormInputValidatesLikelyEmailAddress() {
    #expect(AuthFormInput.isLikelyEmail("tim@jov.ie"))
    #expect(!AuthFormInput.isLikelyEmail("tim"))
    #expect(!AuthFormInput.isLikelyEmail("tim@"))
    #expect(!AuthFormInput.isLikelyEmail("tim@jovie"))
    #expect(!AuthFormInput.isLikelyEmail("tim@jov.ie."))
    #expect(!AuthFormInput.isLikelyEmail("tim@jov..ie"))
    #expect(!AuthFormInput.isLikelyEmail("@jov.ie"))
  }

  @Test func authErrorMapperKeepsSpecificFallbackMessage() {
    let error = NSError(
      domain: "Clerk",
      code: 429,
      userInfo: [NSLocalizedDescriptionKey: "Too many attempts. Try again later."]
    )

    #expect(AuthErrorMapper.message(for: error) == "Too many attempts. Try again later.")
  }
}
