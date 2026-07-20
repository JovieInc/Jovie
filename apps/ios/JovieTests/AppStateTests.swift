import Foundation
import Testing
@testable import Jovie

private actor MockRepository: AppStateRepository {
  var nextResult: Result<MeRepositoryResult, Error>
  private var clearedUserIDs: [String] = []
  private var loadCallCount = 0
  private let loadDelay: Duration?
  private let cached: MobileMeResponse?

  init(
    nextResult: Result<MeRepositoryResult, Error>,
    loadDelay: Duration? = nil,
    cached: MobileMeResponse? = nil
  ) {
    self.nextResult = nextResult
    self.loadDelay = loadDelay
    self.cached = cached
  }

  func loadMe(for clerkUserID: String) async throws -> MeRepositoryResult {
    loadCallCount += 1
    if let loadDelay {
      try await Task.sleep(for: loadDelay)
    }
    return try nextResult.get()
  }

  func cachedSnapshot(for clerkUserID: String) -> MobileMeResponse? {
    cached
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

  func updateResult(_ result: Result<MeRepositoryResult, Error>) {
    nextResult = result
  }
}

private final class MockBrightnessController: BrightnessControlling, @unchecked Sendable {
  func setMaxBrightness() async {}
  func restoreBrightness() async {}
}

@Suite(.serialized)
@MainActor
struct AppStateTests {
  private let configuration = AppConfiguration(
    apiBaseURL: URL(string: "http://localhost:3100")!,
    webBaseURL: URL(string: "https://jov.ie")!,
    sentryDSN: nil,
    observabilityIngestURL: nil,
    observabilityIngestSecret: nil,
    observabilityEnvironment: "test",
    clerkCallbackUrlScheme: "ie.jov.jovie"
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

  @Test func paintsCachedSnapshotInstantlyThenRevalidates() async throws {
    let fresh = MobileMeResponse(
      state: .ready,
      displayName: "Fresh Name",
      username: "fresh",
      publicProfileURL: "https://jov.ie/fresh",
      qrPayload: "https://jov.ie/fresh",
      avatarURL: nil,
      appleWalletProfilePassAvailable: false,
      chatEnabled: true,
      continueOnWebURL: "https://jov.ie/app"
    )
    let repository = MockRepository(
      nextResult: .success(MeRepositoryResult(response: fresh, isStale: false)),
      loadDelay: .milliseconds(300),
      cached: .previewReady
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didLoadClerk = true

    async let change: Void = appState.handleSignedInUserChange("user_123")

    // Well before the 300ms network delay resolves, the cached profile must
    // already be on screen — this is the "blazing fast" guarantee.
    try await Task.sleep(for: .milliseconds(40))
    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))

    await change

    // Once revalidation lands, the fresh profile silently replaces the cache.
    #expect(appState.dashboardState == .loaded(fresh))
    #expect(appState.isOffline == false)
  }

  @Test func cachedSnapshotPaintDoesNotDuplicateNetworkLoad() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      ),
      loadDelay: .milliseconds(50),
      cached: .previewReady
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
    guard case let .loaded(response) = appState.dashboardState else {
      Issue.record("Needs-onboarding profile must stay loaded for continue URL.")
      return
    }
    #expect(response.state == .needsOnboarding)
    #expect(appState.continueOnWebURL.absoluteString == "https://jov.ie/app")
  }

  @Test func coldProfileLoadShowsInteractiveShellBeforeNetworkReturns() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      ),
      loadDelay: .milliseconds(300)
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didLoadClerk = true

    async let change: Void = appState.handleSignedInUserChange("user_123")

    try await Task.sleep(for: .milliseconds(20))
    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loading)

    await change

    #expect(appState.dashboardState == .loaded(.previewReady))
  }

  @Test func cachedNeedsOnboardingSnapshotPreservesContinueOnWebURL() async throws {
    let onboarding = MobileMeResponse(
      state: .needsOnboarding,
      displayName: nil,
      username: nil,
      publicProfileURL: nil,
      qrPayload: nil,
      avatarURL: nil,
      appleWalletProfilePassAvailable: false,
      chatEnabled: false,
      continueOnWebURL: "https://jov.ie/onboarding/start"
    )
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: onboarding, isStale: false)
      ),
      cached: onboarding
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
    #expect(appState.continueOnWebURL.absoluteString == "https://jov.ie/onboarding/start")
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

  @Test func signedInUserSetsObservabilityUserID() async throws {
    let observability = RecordingObservabilityProvider()
    Observability.useProviderForTesting(observability)
    defer { Observability.resetForTesting() }
    let userID = "observability_user_123"

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

    await appState.handleSignedInUserChange(userID)

    #expect(observability.userIDs.filter { $0 == userID } == [userID])
  }

  @Test func signedOutTransitionClearsObservabilityUserID() async throws {
    let observability = RecordingObservabilityProvider()
    Observability.useProviderForTesting(observability)
    defer { Observability.resetForTesting() }

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

    await appState.handleSignedInUserChange("observability_user_123")
    await appState.handleSignedInUserChange(nil)

    #expect(observability.clearUserCount == 1)
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

  @Test func profileLoadFailureShowsRecoveryStateAndRetryRestoresDashboard() async throws {
    let repository = MockRepository(
      nextResult: .failure(APIClientError.requestFailed(statusCode: 500))
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didLoadClerk = true

    await appState.handleSignedInUserChange("user_123")

    #expect(appState.activeUserID == "user_123")
    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .error("Couldn't load your profile."))
    #expect(appState.isOffline == false)

    await repository.updateResult(
      .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    await appState.retry()

    #expect(appState.activeUserID == "user_123")
    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(await repository.loadCount() == 2)
  }

  @Test func profileErrorLaunchModeRetryRestoresDashboard() async throws {
    let repository = MockRepository(
      nextResult: .failure(APIClientError.requestFailed(statusCode: 500))
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingProfileError,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.activeUserID == nil)
    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .error("Couldn't load your profile."))

    await appState.retry()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(await repository.loadCount() == 0)
  }

  @Test func coldOfflineProfileLoadShowsOfflineStateAndRetryClearsIt() async throws {
    let repository = MockRepository(
      nextResult: .failure(APIClientError.transportFailed(code: URLError.notConnectedToInternet.rawValue))
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didLoadClerk = true

    await appState.handleSignedInUserChange("user_123")

    #expect(appState.activeUserID == "user_123")
    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .error("Couldn't load your profile."))
    #expect(appState.isOffline == true)

    await repository.updateResult(
      .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    await appState.retry()

    #expect(appState.activeUserID == "user_123")
    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(await repository.loadCount() == 2)
  }

  @Test func staleProfileSnapshotShowsOfflineStateAndRetryClearsIt() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: true)
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

    #expect(appState.activeUserID == "user_123")
    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == true)

    await repository.updateResult(
      .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    await appState.retry()

    #expect(appState.activeUserID == "user_123")
    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(await repository.loadCount() == 2)
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

  @Test func mobileBrowserAuthURLCanUseRealBrowserProviderCompleteHarness() {
    setenv("JOVIE_IOS_REAL_BROWSER_AUTH", "1", 1)
    setenv("JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN", "token_123", 1)
    defer {
      unsetenv("JOVIE_IOS_REAL_BROWSER_AUTH")
      unsetenv("JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN")
    }

    let url = MobileBrowserAuthURLBuilder.signInURL(
      baseURL: URL(string: "https://preview.example")!,
      codeChallenge: "challenge_123"
    )

    #expect(
      url?.absoluteString == "https://preview.example/api/dev/test-auth/mobile-provider-complete?client=ios&intent=sign_in&return_to=/app&code_challenge=challenge_123&code_challenge_method=S256&persona=creator-ready&test_token=token_123"
    )
  }

  @Test func mobileBrowserAuthURLRejectsHTTPForRealBrowserHarness() {
    setenv("JOVIE_IOS_REAL_BROWSER_AUTH", "1", 1)
    defer {
      unsetenv("JOVIE_IOS_REAL_BROWSER_AUTH")
    }

    let url = MobileBrowserAuthURLBuilder.signInURL(
      baseURL: URL(string: "http://localhost:3100")!,
      codeChallenge: "challenge_123"
    )

    #expect(url == nil)
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

  @Test func mobileAuthReturnParserAcceptsSanitizedProviderDenialCallback() {
    let result = MobileAuthReturnParser.parseProviderError(
      URL(
        string: "ie.jov.jovie://auth/complete?error=access_denied&state=state_123&iss=https%3A%2F%2Fjov.ie%2Fapi%2Fauth"
      )!
    )

    #expect(
      result == MobileAuthProviderError(
        error: "access_denied",
        errorDescription: nil,
        state: "state_123"
      )
    )
    #expect(result?.userMessage == "Couldn't finish sign-in. Try again.")
  }

  @Test func mobileAuthReturnParserAcceptsSanitizedServerErrorCallback() {
    let result = MobileAuthReturnParser.parseProviderError(
      URL(
        string: "ie.jov.jovie://auth/complete?error=server_error&state=state_123&iss=https%3A%2F%2Fjov.ie%2Fapi%2Fauth"
      )!
    )

    #expect(
      result == MobileAuthProviderError(
        error: "server_error",
        errorDescription: nil,
        state: "state_123"
      )
    )
    #expect(result?.userMessage == "Couldn't finish sign-in. Try again.")
  }

  @Test func mobileAuthReturnParserConsumesStoredVerifierForOpenURLCallback() async {
    let store = MobileAuthPendingStore(
      defaults: UserDefaults(suiteName: "MobileAuthPendingStoreTests-\(UUID().uuidString)")!
    )
    await store.save(codeVerifier: "verifier_123")

    let result = await MobileAuthReturnParser.parse(
      URL(string: "ie.jov.jovie://auth/complete?code=code_123&state=state_123")!,
      pendingStore: store
    )

    #expect(
      result == MobileAuthReturn(
        code: "code_123",
        state: "state_123",
        codeVerifier: "verifier_123"
      )
    )
  }

  @Test func mobileAuthReturnParserConsumesPendingVerifierOnlyOnce() async {
    let store = MobileAuthPendingStore(
      defaults: UserDefaults(suiteName: "MobileAuthDuplicateCallbackTests-\(UUID().uuidString)")!
    )
    let callbackURL = URL(string: "ie.jov.jovie://auth/complete?code=code_123&state=state_123")!
    await store.save(codeVerifier: "verifier_123")

    let first = await MobileAuthReturnParser.parse(
      callbackURL,
      pendingStore: store
    )
    let second = await MobileAuthReturnParser.parse(
      callbackURL,
      pendingStore: store
    )

    #expect(first != nil)
    #expect(second == nil)
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

  @Test func offlineChatLaunchModeOpensChatWithOfflineState() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingChatOffline,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == true)
    #expect(appState.launchMode.opensChatOnLaunch == true)
  }

  @Test func qrUnavailableLaunchModeLoadsReadyProfileWithoutQRPayload() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingQRUnavailable,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReadyWithoutQR))
    guard case let .loaded(response) = appState.dashboardState else {
      Issue.record("QR unavailable launch mode did not load a ready dashboard.")
      return
    }
    #expect(response.qrPayload == nil)
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
