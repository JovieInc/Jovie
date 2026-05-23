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

  @Test func mobileBrowserAuthURLUsesCentralAuthStartWithPKCE() {
    let url = MobileBrowserAuthURLBuilder.signInURL(
      baseURL: URL(string: "https://jov.ie")!,
      codeChallenge: "challenge_123"
    )

    #expect(
      url?.absoluteString == "https://jov.ie/auth/start?client=ios&intent=sign_in&return_to=/app&code_challenge=challenge_123&code_challenge_method=S256"
    )
  }

  @Test func mobileBrowserAuthURLFallsBackForUnsafeMobileReturn() {
    let url = MobileBrowserAuthURLBuilder.signInURL(
      baseURL: URL(string: "https://jov.ie")!,
      returnRoute: "https://evil.example/app",
      codeChallenge: "challenge_123"
    )

    #expect(
      url?.absoluteString == "https://jov.ie/auth/start?client=ios&intent=sign_in&return_to=/app&code_challenge=challenge_123&code_challenge_method=S256"
    )
  }

  @Test func mobileAuthReturnParserAcceptsCodeCallback() {
    let result = MobileAuthReturnParser.parse(
      URL(string: "ie.jov.jovie://auth/complete?code=code_123&state=state_123")!,
      codeVerifier: "verifier_123"
    )

    #expect(
      result == MobileAuthReturn(
        code: "code_123",
        state: "state_123",
        codeVerifier: "verifier_123"
      )
    )
  }

  @Test func mobileAuthReturnParserRejectsMissingVerifier() {
    let result = MobileAuthReturnParser.parse(
      URL(string: "ie.jov.jovie://auth/complete?code=code_123&state=state_123")!
    )

    #expect(result == nil)
  }

  @Test func chatLaunchModeOpensChatWithoutChangingReadyState() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingChat,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.launchMode.opensChatOnLaunch == true)
  }

  @Test func billingURLRedirectsToWebBillingSettings() {
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

    #expect(appState.billingURL.absoluteString == "https://jov.ie/app/settings/billing")
  }
}
