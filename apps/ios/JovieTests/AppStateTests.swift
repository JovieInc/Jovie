import AuthenticationServices
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

  func loadMe(for userID: String) async throws -> MeRepositoryResult {
    loadCallCount += 1
    if let loadDelay {
      try await Task.sleep(for: loadDelay)
    }
    return try nextResult.get()
  }

  func cachedSnapshot(for userID: String) -> MobileMeResponse? {
    cached
  }

  func clearCachedUser(_ userID: String) {
    clearedUserIDs.append(userID)
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

private actor MockSessionRevoker: NativeSessionRevoking {
  private let result: NativeSessionRevocationResult
  private var callCount = 0

  init(result: NativeSessionRevocationResult) {
    self.result = result
  }

  func revokeCurrentSession() async -> NativeSessionRevocationResult {
    callCount += 1
    return result
  }

  func calls() -> Int {
    callCount
  }
}

private func makeIsolatedChatCache(suiteName: String) -> ChatCache {
  let defaults = UserDefaults(suiteName: suiteName)!
  defaults.removePersistentDomain(forName: suiteName)
  return ChatCache(defaults: defaults)
}

private func makeIsolatedAudienceHighlightsCache(suiteName: String) -> AudienceHighlightsCache {
  let defaults = UserDefaults(suiteName: suiteName)!
  defaults.removePersistentDomain(forName: suiteName)
  return AudienceHighlightsCache(defaults: defaults)
}

private func makeIsolatedActionLoopCache(suiteName: String) -> ActionLoopCache {
  let defaults = UserDefaults(suiteName: suiteName)!
  defaults.removePersistentDomain(forName: suiteName)
  return ActionLoopCache(defaults: defaults)
}

private func makeChatSnapshot() -> CachedChatSnapshot {
  CachedChatSnapshot(
    conversations: [
      MobileConversationSummary(
        id: "conv_cached",
        title: "Cached chat",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        latestMessageRole: "assistant",
        latestTurnStatus: "completed"
      ),
    ],
    messagesByConversationID: [:],
    cachedAt: Date(timeIntervalSince1970: 1_700_000_000)
  )
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
    observabilityEnvironment: "test"
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
    appState.didInitializeAuth = true

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
    appState.didInitializeAuth = true

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
    appState.didInitializeAuth = true

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
    appState.didInitializeAuth = true

    await appState.handleSignedInUserChange("user_123")

    #expect(appState.route == .needsOnboarding)
    guard case let .loaded(response) = appState.dashboardState else {
      Issue.record("Needs-onboarding profile must stay loaded for continue URL.")
      return
    }
    #expect(response.state == .needsOnboarding)
    #expect(appState.continueOnWebURL.absoluteString == "https://jov.ie/app")
  }

  @Test func mapsWaitlistPendingResponseAwayFromProfileCompletion() async throws {
    let pending = MobileMeResponse(
      state: .waitlistPending,
      displayName: nil,
      username: nil,
      publicProfileURL: nil,
      qrPayload: nil,
      avatarURL: nil,
      appleWalletProfilePassAvailable: false,
      chatEnabled: false,
      continueOnWebURL: "https://jov.ie/app"
    )
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: pending, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didInitializeAuth = true

    await appState.handleSignedInUserChange("user_pending")

    #expect(appState.route == .waitlistPending)
    #expect(appState.dashboardState == .loaded(pending))
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
    appState.didInitializeAuth = true

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
    appState.didInitializeAuth = true

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
    let sessionRevoker = MockSessionRevoker(result: .revoked)
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController(),
      sessionRevoker: sessionRevoker
    )
    appState.didInitializeAuth = true

    await appState.handleSignedInUserChange("user_123")
    try await withNativeSessionTokenStoreTestIsolation {
      await appState.signOut()
    }

    #expect(appState.route == .signedOut)
    #expect(appState.dashboardState == .idle)
    #expect(appState.activeUserID == nil)
    #expect(appState.isOffline == false)
    #expect(await sessionRevoker.calls() == 1)
    #expect(await repository.clearedUsers() == ["user_123"])
  }

  @Test func signOutStillClearsLocalStateWhenRemoteRevocationFails() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let sessionRevoker = MockSessionRevoker(result: .failed(statusCode: 503))
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController(),
      sessionRevoker: sessionRevoker
    )
    appState.didInitializeAuth = true

    await appState.handleSignedInUserChange("user_123")
    try await withNativeSessionTokenStoreTestIsolation {
      await appState.signOut()
    }

    #expect(appState.route == .signedOut)
    #expect(appState.activeUserID == nil)
    #expect(await sessionRevoker.calls() == 1)
    #expect(await repository.clearedUsers() == ["user_123"])
  }

  @Test func expiredSessionReturnsToSignInWithoutRemoteRevocation() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let sessionRevoker = MockSessionRevoker(result: .revoked)
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController(),
      sessionRevoker: sessionRevoker
    )
    appState.didInitializeAuth = true

    await appState.handleSignedInUserChange("user_123")
    try await withNativeSessionTokenStoreTestIsolation {
      await appState.handleExpiredSession()
    }

    #expect(appState.route == .signedOut)
    #expect(appState.dashboardState == .idle)
    #expect(appState.activeUserID == nil)
    #expect(await sessionRevoker.calls() == 0)
    #expect(await repository.clearedUsers() == ["user_123"])
  }

  @Test func signOutClearsChatDiskCache() async throws {
    let userID = "user_chat_signout"
    let chatCache = makeIsolatedChatCache(suiteName: "AppStateChatCacheSignOut")
    await chatCache.store(makeChatSnapshot(), for: userID)
    #expect(await chatCache.load(for: userID) != nil)

    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController(),
      chatCache: chatCache
    )
    appState.didInitializeAuth = true

    await appState.handleSignedInUserChange(userID)
    try await withNativeSessionTokenStoreTestIsolation {
      await appState.signOut()
    }

    #expect(appState.route == .signedOut)
    #expect(appState.activeUserID == nil)
    #expect(await chatCache.load(for: userID) == nil)
  }

  @Test func expiredSessionClearsChatDiskCache() async throws {
    let userID = "user_chat_expired"
    let chatCache = makeIsolatedChatCache(suiteName: "AppStateChatCacheExpired")
    await chatCache.store(makeChatSnapshot(), for: userID)
    #expect(await chatCache.load(for: userID) != nil)

    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController(),
      chatCache: chatCache
    )
    appState.didInitializeAuth = true

    await appState.handleSignedInUserChange(userID)
    try await withNativeSessionTokenStoreTestIsolation {
      await appState.handleExpiredSession()
    }

    #expect(appState.route == .signedOut)
    #expect(appState.activeUserID == nil)
    #expect(await chatCache.load(for: userID) == nil)
  }

  @Test func signOutClearsActionLoopAndAudienceCaches() async throws {
    let userID = "user_action_loop_signout"
    let audienceCache = makeIsolatedAudienceHighlightsCache(
      suiteName: "AppStateAudienceCacheSignOut"
    )
    let actionLoopCache = makeIsolatedActionLoopCache(
      suiteName: "AppStateActionLoopCacheSignOut"
    )
    await audienceCache.store(.preview, for: userID)
    await actionLoopCache.storeInbox(.preview, for: userID)
    await actionLoopCache.storeCalendar(.preview, for: userID)
    #expect(await audienceCache.load(for: userID) != nil)
    #expect(await actionLoopCache.loadInbox(for: userID) != nil)
    #expect(await actionLoopCache.loadCalendar(for: userID) != nil)

    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController(),
      audienceHighlightsCache: audienceCache,
      actionLoopCache: actionLoopCache
    )
    appState.didInitializeAuth = true

    await appState.handleSignedInUserChange(userID)
    try await withNativeSessionTokenStoreTestIsolation {
      await appState.signOut()
    }

    #expect(appState.route == .signedOut)
    #expect(appState.activeUserID == nil)
    #expect(await audienceCache.load(for: userID) == nil)
    #expect(await actionLoopCache.loadInbox(for: userID) == nil)
    #expect(await actionLoopCache.loadCalendar(for: userID) == nil)
  }

  @Test func expiredSessionClearsActionLoopAndAudienceCaches() async throws {
    let userID = "user_action_loop_expired"
    let audienceCache = makeIsolatedAudienceHighlightsCache(
      suiteName: "AppStateAudienceCacheExpired"
    )
    let actionLoopCache = makeIsolatedActionLoopCache(
      suiteName: "AppStateActionLoopCacheExpired"
    )
    await audienceCache.store(.preview, for: userID)
    await actionLoopCache.storeInbox(.preview, for: userID)
    await actionLoopCache.storeCalendar(.preview, for: userID)
    #expect(await audienceCache.load(for: userID) != nil)
    #expect(await actionLoopCache.loadInbox(for: userID) != nil)
    #expect(await actionLoopCache.loadCalendar(for: userID) != nil)

    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController(),
      audienceHighlightsCache: audienceCache,
      actionLoopCache: actionLoopCache
    )
    appState.didInitializeAuth = true

    await appState.handleSignedInUserChange(userID)
    try await withNativeSessionTokenStoreTestIsolation {
      await appState.handleExpiredSession()
    }

    #expect(appState.route == .signedOut)
    #expect(appState.activeUserID == nil)
    #expect(await audienceCache.load(for: userID) == nil)
    #expect(await actionLoopCache.loadInbox(for: userID) == nil)
    #expect(await actionLoopCache.loadCalendar(for: userID) == nil)
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
    appState.didInitializeAuth = true

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
    appState.didInitializeAuth = true

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
    appState.didInitializeAuth = true

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
    appState.didInitializeAuth = true

    async let load: Void = appState.handleSignedInUserChange("user_123")
    try await Task.sleep(for: .milliseconds(10))
    try await withNativeSessionTokenStoreTestIsolation {
      await appState.signOut()
    }
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
    appState.didInitializeAuth = true

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
    appState.didInitializeAuth = true

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

  @Test func cachedProfileThen401RevalidationSignsOut() async throws {
    let repository = MockRepository(
      nextResult: .failure(APIClientError.requestFailed(statusCode: 401)),
      cached: .previewReady
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didInitializeAuth = true

    try await withNativeSessionTokenStoreTestIsolation {
      await appState.handleSignedInUserChange("user_123")
    }

    #expect(appState.route == .signedOut)
    #expect(appState.dashboardState == .idle)
    #expect(appState.activeUserID == nil)
    #expect(appState.isOffline == false)
    #expect(await repository.clearedUsers() == ["user_123"])
  }

  @Test func cachedMeThen401ThroughRealRepositorySignsOut() async throws {
    let suiteName = "AppStateMe401Composed"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)
    let cache = MeCache(defaults: defaults)
    let apiClient = MutableAPIClient(mode: .success(.previewReady))
    let repository = MeRepository(apiClient: apiClient, cache: cache)

    _ = try await repository.loadMe(for: "user_123")
    await apiClient.updateMode(.failure(APIClientError.requestFailed(statusCode: 401)))

    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )
    appState.didInitializeAuth = true

    try await withNativeSessionTokenStoreTestIsolation {
      await appState.handleSignedInUserChange("user_123")
    }

    #expect(appState.route == .signedOut)
    #expect(appState.activeUserID == nil)
    #expect(appState.dashboardState == .idle)
    #expect(appState.isOffline == false)
    #expect(await cache.load(for: "user_123") == nil)
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
    appState.didInitializeAuth = true

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

  @Test func mobileBrowserAuthURLAllowsLocalhostHTTPOutsideHarness() {
    let url = MobileBrowserAuthURLBuilder.signInURL(
      baseURL: URL(string: "http://localhost:3100")!,
      codeChallenge: "challenge_123"
    )

    #expect(
      url?.absoluteString == "http://localhost:3100/auth/start?client=ios&intent=sign_in&return_to=/app&code_challenge=challenge_123&code_challenge_method=S256"
    )
  }

  @Test func mobileBrowserAuthURLRejectsSchemelessAndCleartextRemoteHosts() {
    #expect(
      MobileBrowserAuthURLBuilder.signInURL(
        baseURL: URL(string: "jov.ie")!,
        codeChallenge: "challenge_123"
      ) == nil
    )
    #expect(
      MobileBrowserAuthURLBuilder.signInURL(
        baseURL: URL(string: "http://jov.ie")!,
        codeChallenge: "challenge_123"
      ) == nil
    )
    #expect(
      MobileBrowserAuthURLBuilder.isSupportedBrowserAuthURL(
        URL(string: "https://jov.ie")!
      )
    )
    #expect(
      !MobileBrowserAuthURLBuilder.isSupportedBrowserAuthURL(
        URL(string: "jov.ie")!
      )
    )
  }

  @Test func mobileAuthPresentationAnchorPrefersKeyThenVisibleWindow() {
    #expect(
      MobileAuthPresentationAnchor.preferredWindowIndex(
        in: [
          MobileAuthWindowSnapshot(isKey: false, isHidden: false),
          MobileAuthWindowSnapshot(isKey: true, isHidden: false),
        ]
      ) == 1
    )
    #expect(
      MobileAuthPresentationAnchor.preferredWindowIndex(
        in: [
          MobileAuthWindowSnapshot(isKey: false, isHidden: true),
          MobileAuthWindowSnapshot(isKey: false, isHidden: false),
        ]
      ) == 1
    )
    #expect(
      MobileAuthPresentationAnchor.preferredWindowIndex(
        in: [MobileAuthWindowSnapshot(isKey: false, isHidden: true)]
      ) == nil
    )
  }

  @Test func mobileAuthCoordinatorErrorsKeepStableNSErrorCodes() {
    #expect(
      (MobileAuthCoordinatorError.invalidAuthURL as NSError).domain ==
        "Jovie.MobileAuthCoordinatorError"
    )
    #expect((MobileAuthCoordinatorError.invalidAuthURL as NSError).code == 1)
    #expect((MobileAuthCoordinatorError.sessionStartFailed as NSError).code == 2)
    #expect((MobileAuthCoordinatorError.missingCallbackURL as NSError).code == 3)
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

  @Test func mobileAuthReturnParserAcceptsHttpsIosCompleteCallback() {
    let result = MobileAuthReturnParser.parse(
      URL(string: "https://jov.ie/auth/ios/complete?code=code_123&state=state_123")!,
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

  @Test func mobileAuthReturnParserAcceptsLocalHttpsHandback() {
    let result = MobileAuthReturnParser.parse(
      URL(string: "http://localhost:3112/auth/ios/complete?code=code_123&state=state_123")!,
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

  @Test func mobileAuthReturnParserRejectsWebAppPagesAsCallbacks() {
    #expect(
      MobileAuthReturnParser.parse(
        URL(string: "https://jov.ie/app?code=code_123&state=state_123")!,
        codeVerifier: "verifier_123"
      ) == nil
    )
    #expect(
      MobileAuthReturnParser.parse(
        URL(string: "https://jov.ie/app/library?code=code_123&state=state_123")!,
        codeVerifier: "verifier_123"
      ) == nil
    )
    #expect(
      MobileAuthReturnParser.parse(
        URL(string: "https://evil.example/auth/ios/complete?code=code_123&state=state_123")!,
        codeVerifier: "verifier_123"
      ) == nil
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
    #expect(
      result?.userMessage == "Sign-in was cancelled. Sign in again when you're ready."
    )
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

  @Test func mobileAuthRecoveryMessageMakesRetryActionExplicit() {
    #expect(
      mobileAuthButtonTitle(
        isOpening: false,
        isDisabled: false,
        hasRecoveryMessage: true
      ) == "Sign In Again"
    )
    #expect(
      mobileAuthButtonTitle(
        isOpening: false,
        isDisabled: false,
        hasRecoveryMessage: false
      ) == "Continue to Jovie"
    )
    #expect(canStartMobileAuth(isMock: false, isOpening: false))
    #expect(!canStartMobileAuth(isMock: false, isOpening: true))
    #expect(
      mobileAuthButtonIsDisabled(isDisabled: false, isOpening: true)
    )
  }

  @Test func presentationAnchorPrefersForegroundActiveWindowOverInactiveKeyWindow() {
    let candidates = [
      MobileAuthPresentationWindowCandidate(isForegroundActive: false, isKeyWindow: true),
      MobileAuthPresentationWindowCandidate(isForegroundActive: true, isKeyWindow: false),
    ]

    #expect(MobileAuthPresentationWindowSelector.selectedIndex(from: candidates) == 1)
  }

  @Test func presentationAnchorPrefersKeyWindowWhenSceneIsForegroundActive() {
    let candidates = [
      MobileAuthPresentationWindowCandidate(isForegroundActive: true, isKeyWindow: false),
      MobileAuthPresentationWindowCandidate(isForegroundActive: true, isKeyWindow: true),
    ]

    #expect(MobileAuthPresentationWindowSelector.selectedIndex(from: candidates) == 1)
  }

  @Test func presentationAnchorDoesNotInventAWindowWhenNoSceneIsForegroundActive() {
    let candidates = [
      MobileAuthPresentationWindowCandidate(isForegroundActive: false, isKeyWindow: true),
      MobileAuthPresentationWindowCandidate(isForegroundActive: false, isKeyWindow: false),
    ]

    #expect(MobileAuthPresentationWindowSelector.selectedIndex(from: candidates) == nil)
  }

  @Test func presentationContextInvalidRetriesOnceThenSurfaces() {
    let error = NSError(
      domain: ASWebAuthenticationSessionErrorDomain,
      code: ASWebAuthenticationSessionError.Code.presentationContextInvalid.rawValue,
      userInfo: [
        NSDebugDescriptionErrorKey:
          "The UIWindowScene for the returned window was not in the foreground active state.",
      ]
    )

    #expect(isAuthSessionPresentationContextInvalid(error))
    #expect(
      MobileAuthPresentationContextRetryPolicy.shouldRetry(error: error, attempt: 1)
    )
    #expect(
      !MobileAuthPresentationContextRetryPolicy.shouldRetry(error: error, attempt: 2)
    )
    #expect(
      !MobileAuthPresentationContextRetryPolicy.shouldRetry(
        error: CancellationError(),
        attempt: 1
      )
    )
  }

  @Test func mobileAuthFailuresPreserveCancellationRecoveryCopy() {
    #expect(
      mobileAuthFailureMessage(for: CancellationError()) == MobileAuthCopy.cancellation
    )

    let providerError = MobileAuthCoordinatorError.providerError(
      MobileAuthProviderError(
        error: "access_denied",
        errorDescription: nil,
        state: "state_123"
      )
    )

    #expect(
      mobileAuthFailureMessage(for: providerError) == MobileAuthCopy.cancellation
    )
    #expect(
      mobileAuthFailureMessage(for: MobileAuthCoordinatorError.invalidAuthURL) ==
        MobileAuthCopy.failure
    )
    #expect(
      mobileAuthFailureMessage(for: MobileAuthCoordinatorError.sessionStartFailed) ==
        MobileAuthCopy.failure
    )
  }

  @Test func providerErrorCallbacksRequirePendingSignedOutAuth() {
    #expect(
      shouldHandleMobileAuthProviderError(
        route: .signedOut,
        hasPendingVerifier: true
      )
    )
    #expect(
      !shouldHandleMobileAuthProviderError(
        route: .ready,
        hasPendingVerifier: true
      )
    )
    #expect(
      !shouldHandleMobileAuthProviderError(
        route: .signedOut,
        hasPendingVerifier: false
      )
    )
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

  @Test func allComponentsChatLaunchModeOpensChatWithActiveUserID() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingChatAllComponents,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(appState.activeUserID == "user_ui_testing_chat_all_components")
    #expect(appState.launchMode.opensChatOnLaunch == true)
    #expect(appState.launchMode.chatEntityFixture?.isEmpty == false)
  }

  @Test func entityFixtureChatLaunchModeSetsActiveUserID() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingChatEntityFixture,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.activeUserID == "user_ui_testing_chat_entity_fixture")
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

  @Test func libraryLaunchModeOpensLibraryWithoutChangingReadyState() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingLibrary,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(appState.launchMode.defaultInitialTab == .library)
    #expect(appState.launchMode.usesEmptyLibraryPreview == false)
  }

  @Test func libraryEmptyLaunchModeOpensEmptyLibraryPreview() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingLibraryEmpty,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(appState.launchMode.defaultInitialTab == .library)
    #expect(appState.launchMode.usesEmptyLibraryPreview)
  }

  @Test func inboxLaunchModeOpensInboxWithoutChangingReadyState() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingInbox,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(appState.launchMode.defaultInitialTab == .inbox)
  }

  @Test func offlineInboxLaunchModeOpensInboxWithOfflineState() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingInboxOffline,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == true)
    #expect(appState.launchMode.defaultInitialTab == .inbox)
  }

  @Test func inboxLoadingLaunchModeOpensInboxReadyWithoutOffline() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingInboxLoading,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(appState.launchMode.defaultInitialTab == .inbox)
    #expect(appState.launchMode.holdsActionLoopLoading)
  }

  @Test func calendarLaunchModeOpensCalendarWithoutChangingReadyState() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingCalendar,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(appState.launchMode.defaultInitialTab == .calendar)
  }

  @Test func calendarLoadingLaunchModeOpensCalendarReadyWithoutOffline() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingCalendarLoading,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)
    #expect(appState.launchMode.defaultInitialTab == .calendar)
    #expect(appState.launchMode.holdsActionLoopLoading)
  }

  @Test func offlineCalendarLaunchModeOpensCalendarWithOfflineState() async throws {
    let repository = MockRepository(
      nextResult: .success(
        MeRepositoryResult(response: .previewReady, isStale: false)
      )
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .uiTestingCalendarOffline,
      repository: repository,
      brightnessManager: MockBrightnessController()
    )

    await appState.completeLaunch()

    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == true)
    #expect(appState.launchMode.defaultInitialTab == .calendar)
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

  @Test func accountURLUsesCanonicalWebSettingsRoute() {
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

    #expect(appState.accountURL.absoluteString == "https://jov.ie/app/settings/account")
  }
}

struct FeatureIntroPresentationTests {
  private let highlight = FeatureIntroHighlight(
    id: "highlight-a",
    systemImage: "sparkles",
    title: "Your Catalog Is Already In Chat",
    oneLine: "Ask about a release, a show, or the next move.",
    ctaTitle: "Ask Something"
  )

  private var fourBullets: [FeatureIntroBullet] {
    [
      FeatureIntroBullet(id: "one", text: "Talk from the home screen.", accent: .accent),
      FeatureIntroBullet(id: "two", text: "Library stays nearby.", accent: .blue),
      FeatureIntroBullet(id: "three", text: "Profile setup stays on iPhone.", accent: .orange),
      FeatureIntroBullet(id: "four", text: "Canceled sign-in is recoverable.", accent: .accent),
    ]
  }

  @Test func prefersHighlightOverWhatsNewUntilThatHighlightIsDismissed() {
    let catalog = FeatureIntroCatalog(
      highlight: highlight,
      whatsNewID: "wave-1",
      whatsNewItems: Array(fourBullets.prefix(2))
    )

    #expect(
      FeatureIntroPresentation.resolve(
        catalog: catalog,
        dismissedHighlightID: nil,
        dismissedWhatsNewID: nil
      ) == .highlight(highlight)
    )
    #expect(
      FeatureIntroPresentation.resolve(
        catalog: catalog,
        dismissedHighlightID: "",
        dismissedWhatsNewID: nil
      ) == .highlight(highlight)
    )

    guard case let .whatsNew(id, rows) = FeatureIntroPresentation.resolve(
      catalog: catalog,
      dismissedHighlightID: highlight.id,
      dismissedWhatsNewID: nil
    ) else {
      Issue.record("Expected what's new after the highlight is dismissed")
      return
    }
    #expect(id == "wave-1")
    #expect(rows == fourBullets.prefix(2).map(FeatureIntroVisibleRow.bullet))
  }

  @Test func usesWhatsNewWhenTheCatalogHasNoHighlight() {
    let catalog = FeatureIntroCatalog(
      highlight: nil,
      whatsNewID: "wave-1",
      whatsNewItems: Array(fourBullets.prefix(2))
    )

    guard case let .whatsNew(id, _) = FeatureIntroPresentation.resolve(
      catalog: catalog,
      dismissedHighlightID: nil,
      dismissedWhatsNewID: nil
    ) else {
      Issue.record("Expected what's new when no highlight is published")
      return
    }
    #expect(id == "wave-1")
  }

  @Test func dismissPersistenceHidesTheSameCardAcrossLaunches() {
    let catalog = FeatureIntroCatalog(
      highlight: highlight,
      whatsNewID: "wave-1",
      whatsNewItems: Array(fourBullets.prefix(2))
    )

    #expect(
      FeatureIntroPresentation.resolve(
        catalog: catalog,
        dismissedHighlightID: highlight.id,
        dismissedWhatsNewID: "wave-1"
      ) == nil
    )
    #expect(
      FeatureIntroPresentation.isDismissed(id: highlight.id, dismissedID: highlight.id)
    )
    #expect(
      !FeatureIntroPresentation.isDismissed(id: highlight.id, dismissedID: "other")
    )
    #expect(FeatureIntroStorage.dismissedHighlightIDKey == "jovie.featureIntro.dismissedHighlightID")
    #expect(FeatureIntroStorage.dismissedWhatsNewIDKey == "jovie.featureIntro.dismissedWhatsNewID")
  }

  @Test func capsWhatsNewAtThreeRowsAndUsesAndMoreWhenThereAreMoreThanThreeItems() {
    let overflow = FeatureIntroPresentation.visibleWhatsNewRows(from: fourBullets)
    #expect(overflow.count == FeatureIntroPresentation.maxWhatsNewRows)
    #expect(overflow == [
      .bullet(fourBullets[0]),
      .bullet(fourBullets[1]),
      .andMore,
    ])

    let three = FeatureIntroPresentation.visibleWhatsNewRows(from: Array(fourBullets.prefix(3)))
    #expect(three == fourBullets.prefix(3).map(FeatureIntroVisibleRow.bullet))
    #expect(!three.contains(.andMore))

    let two = FeatureIntroPresentation.visibleWhatsNewRows(from: Array(fourBullets.prefix(2)))
    #expect(two.count == 2)
    #expect(!two.contains(.andMore))
  }

  @Test func changelogURLStaysOnTheWebOrigin() {
    let url = FeatureIntroCatalog.changelogURL(from: URL(string: "https://jov.ie")!)
    #expect(url.absoluteString == "https://jov.ie/changelog")
  }

  @Test func versionedItemsNameTestableChanges() {
    let items = WhatsNewCatalog.items(for: "1.0")
    #expect(items.isEmpty == false)
    #expect(items.allSatisfy { !$0.title.isEmpty && !$0.testHint.isEmpty })
    #expect(items.contains(where: { $0.testHint.localizedCaseInsensitiveContains("Ask Jovie") }))
    #expect(items.contains(where: { $0.testHint.localizedCaseInsensitiveContains("bottom tab") }))
    #expect(items.contains(where: { $0.testHint.localizedCaseInsensitiveContains("sidebar") }))
  }

  @Test func unknownVersionStillShipsATestableItem() {
    let items = WhatsNewCatalog.items(for: "9.9")
    #expect(items.isEmpty == false)
    #expect(items.allSatisfy { !$0.testHint.isEmpty })
    #expect(items[0].testHint.contains("9.9"))
  }

  @Test func whatsNewLaunchModePresentsOnReadyChat() {
    #expect(
      LaunchMode.resolving(arguments: ["-ui-testing-whats-new"], isXCTest: false)
        == .uiTestingWhatsNew
    )
    #expect(LaunchMode.uiTestingWhatsNew.presentsWhatsNew)
    #expect(LaunchMode.uiTestingWhatsNew.defaultInitialTab == .chat)
    #expect(LaunchMode.uiTestingChat.presentsWhatsNew == false)
    #expect(LaunchMode.live.presentsWhatsNew)
  }
}

struct AuthenticatedUserIDChangePolicyTests {
  @Test func skipsNilOnlyWhenLiveAuthOwnsHydrate() {
    #expect(
      shouldApplyAuthenticatedUserIDChange(
        launchMode: .live,
        authenticatedUserID: nil,
        liveHydrateOwnsSession: true
      ) == false
    )
    #expect(
      shouldApplyAuthenticatedUserIDChange(
        launchMode: .live,
        authenticatedUserID: nil,
        liveHydrateOwnsSession: false
      )
    )
    #expect(
      shouldApplyAuthenticatedUserIDChange(
        launchMode: .live,
        authenticatedUserID: "user",
        liveHydrateOwnsSession: true
      )
    )
    #expect(
      shouldApplyAuthenticatedUserIDChange(
        launchMode: .uiTestingReady,
        authenticatedUserID: nil,
        liveHydrateOwnsSession: false
      )
    )
  }
}
