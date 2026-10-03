import AuthenticationServices
import Foundation
import JovieKit
import Testing
import UserNotifications
@testable import Jovie

private actor ProfileRevalidationGate {
  private var completion: CheckedContinuation<Void, Never>?
  private var startedObserver: CheckedContinuation<Bool, Never>?
  private var started = false
  private var finished = false
  private var released = false

  func wait() async {
    started = true
    startedObserver?.resume(returning: true)
    startedObserver = nil
    if released { return }
    await withCheckedContinuation { continuation in
      completion = continuation
    }
  }

  func waitUntilStarted() async -> Bool {
    if started { return true }
    if finished { return false }
    return await withCheckedContinuation { startedObserver = $0 }
  }

  func ownerFinished() {
    finished = true
    startedObserver?.resume(returning: started)
    startedObserver = nil
  }

  func release() {
    released = true
    completion?.resume()
    completion = nil
  }
}

private actor MockRepository: AppStateRepository {
  var nextResult: Result<MeRepositoryResult, Error>
  private var clearedUserIDs: [String] = []
  private var loadCallCount = 0
  private let loadDelay: Duration?
  private let revalidationGate: ProfileRevalidationGate?
  private let cached: MobileMeResponse?

  init(
    nextResult: Result<MeRepositoryResult, Error>,
    loadDelay: Duration? = nil,
    revalidationGate: ProfileRevalidationGate? = nil,
    cached: MobileMeResponse? = nil
  ) {
    self.nextResult = nextResult
    self.loadDelay = loadDelay
    self.revalidationGate = revalidationGate
    self.cached = cached
  }

  func loadMe(for userID: String) async throws -> MeRepositoryResult {
    loadCallCount += 1
    await revalidationGate?.wait()
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

  func clearCachedUser(_ userID: String, ifOwnedBy ownership: NativeSessionOwnership) {
    NativeSessionTokenStore.performIfCurrent(ownership) { clearedUserIDs.append(userID) }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
    let revalidation = ProfileRevalidationGate()
    let repository = MockRepository(
      nextResult: .success(MeRepositoryResult(response: fresh, isStale: false)),
      revalidationGate: revalidation,
      cached: .previewReady
    )
    let appState = AppState(
      configuration: configuration,
      launchMode: .live,
      repository: repository,
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
    )
    appState.didInitializeAuth = true

    async let change: Void = {
      await appState.handleSignedInUserChange("user_123")
      await revalidation.ownerFinished()
    }()

    // Observe the cache after revalidation starts but before it can complete.
    // This proves cache-first paint without depending on executor scheduling.
    let revalidationStarted = await revalidation.waitUntilStarted()
    #expect(revalidationStarted)
    #expect(appState.route == .ready)
    #expect(appState.dashboardState == .loaded(.previewReady))
    #expect(appState.isOffline == false)

    await revalidation.release()
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      sessionRevoker: sessionRevoker,
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      sessionRevoker: sessionRevoker,
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      sessionRevoker: sessionRevoker,
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      chatCache: chatCache,
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      chatCache: chatCache,
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      actionLoopCache: actionLoopCache,
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      actionLoopCache: actionLoopCache,
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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
      brightnessManager: MockBrightnessController(),
      captureProfileLoadCurrentness: { _ in .unmanaged() }
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

struct WhatsNewFeedPolicyTests {
  private func entry(_ id: String) -> WhatsNewFeedEntry {
    WhatsNewFeedEntry(
      id: id,
      title: "Title \(id)",
      date: "2026-09-26",
      summary: "Summary",
      url: URL(string: "https://jov.ie/changelog/\(id)")!,
      highlights: [],
      dogfood: []
    )
  }

  private func feed(_ ids: [String]) -> WhatsNewFeed {
    WhatsNewFeed(
      version: 1,
      changelogUrl: URL(string: "https://jov.ie/changelog")!,
      entries: ids.map(entry)
    )
  }

  @Test func showsNothingForAnEmptyFeed() {
    #expect(WhatsNewFeedPolicy.resolve(feed: feed([]), lastSeenID: nil) == nil)
  }

  @Test func showsNothingWhenTheNewestReleaseWasSeen() {
    #expect(WhatsNewFeedPolicy.resolve(feed: feed(["3", "2"]), lastSeenID: "3") == nil)
  }

  @Test func showsTheNewestPostOnFirstLaunch() {
    let unseen = WhatsNewFeedPolicy.resolve(feed: feed(["3", "2"]), lastSeenID: nil)
    #expect(unseen?.entry.id == "3")
    #expect(unseen?.unseenCount == 1)
    #expect(unseen?.link.absoluteString == "https://jov.ie/changelog/3")
  }

  @Test func linksTheChangelogIndexWhenSeveralAreUnseen() {
    let unseen = WhatsNewFeedPolicy.resolve(feed: feed(["3", "2", "1"]), lastSeenID: "1")
    #expect(unseen?.entry.id == "3")
    #expect(unseen?.unseenCount == 2)
    #expect(unseen?.link.absoluteString == "https://jov.ie/changelog")
  }

  @Test func treatsAnAgedOutLastSeenIDAsOneNewRelease() {
    let unseen = WhatsNewFeedPolicy.resolve(feed: feed(["3", "2"]), lastSeenID: "0.1")
    #expect(unseen?.unseenCount == 1)
  }

  @Test func decodesTheWebContract() throws {
    let json = """
    {"version":1,"changelogUrl":"https://jov.ie/changelog","entries":[
      {"id":"26.9.2","title":"Chat is home","date":"2026-09-26",
       "summary":"Ask first.","url":"https://jov.ie/changelog/26.9.2",
       "highlights":["Library filters"],"dogfood":["Open chat and ask"]}
    ]}
    """
    let decoded = try #require(WhatsNewFeedPolicy.decode(Data(json.utf8)))
    #expect(decoded.entries.first?.dogfood == ["Open chat and ask"])
    #expect(decoded.changelogUrl.absoluteString == "https://jov.ie/changelog")
  }

  @Test func rejectsOtherContractVersionsAndGarbage() {
    let future = #"{"version":2,"changelogUrl":"https://jov.ie/changelog","entries":[]}"#
    #expect(WhatsNewFeedPolicy.decode(Data(future.utf8)) == nil)
    #expect(WhatsNewFeedPolicy.decode(Data("not json".utf8)) == nil)
  }
}

private actor PushLifecycleGate {
  private var completion: CheckedContinuation<Bool, Never>?
  private var entered = false
  private var observers: [CheckedContinuation<Void, Never>] = []

  func wait() async -> Bool {
    await withCheckedContinuation { continuation in
      completion = continuation
      entered = true
      observers.forEach { $0.resume() }
      observers.removeAll()
    }
  }

  func waitUntilEntered() async {
    if entered { return }
    await withCheckedContinuation { observers.append($0) }
  }

  func complete(_ result: Bool) {
    completion?.resume(returning: result)
    completion = nil
  }
}

private actor PushLifecycleService: PushDeviceServicing {
  struct Request: Equatable, Sendable {
    let token: String
    let authorization: NativeRequestAuthorization
  }
  private var uploads: [Request] = []
  private var deletions: [Request] = []
  private var uploadGate: PushLifecycleGate?
  private var deleteGate: PushLifecycleGate?

  func holdUpload(_ gate: PushLifecycleGate) { uploadGate = gate }
  func holdDelete(_ gate: PushLifecycleGate) { deleteGate = gate }
  func requests() -> (uploads: [Request], deletions: [Request]) { (uploads, deletions) }

  func registerPushDevice(
    token: String, environment: IOSPushEnvironment, timezone: String,
    authorization: NativeRequestAuthorization
  ) async throws {
    uploads.append(Request(token: token, authorization: authorization))
    let gate = uploadGate
    uploadGate = nil
    if let gate, !(await gate.wait()) { throw APIClientError.requestFailed(statusCode: 401) }
  }

  func unregisterPushDevice(token: String, authorization: NativeRequestAuthorization) async throws {
    deletions.append(Request(token: token, authorization: authorization))
    let gate = deleteGate
    deleteGate = nil
    if let gate, !(await gate.wait()) { throw APIClientError.requestFailed(statusCode: 401) }
  }
}

@MainActor
private final class PushLifecycleHarness {
  static let tokenKey = "jovie.apns.device-token"
  let suiteName: String
  let defaults: UserDefaults
  let service = PushLifecycleService()
  var registerCount = 0
  var unregisterCount = 0
  var status: @MainActor () async -> UNAuthorizationStatus = { .authorized }
  var permission: @MainActor () async throws -> Bool = { true }
  lazy var manager: PushNotificationManager = {
    let manager = PushNotificationManager(
      system: PushNotificationSystem(
        authorizationStatus: { [unowned self] in await self.status() },
        requestAuthorization: { [unowned self] in try await self.permission() },
        register: { [unowned self] in self.registerCount += 1 },
        unregister: { [unowned self] in self.unregisterCount += 1 }
      ),
      defaults: defaults
    )
    manager.configure(apiClient: service)
    return manager
  }()

  init() {
    let name = "PushLifecycleTests-\(UUID().uuidString)"
    suiteName = name
    defaults = UserDefaults(suiteName: name)!
  }
  func cleanup() { defaults.removePersistentDomain(forName: suiteName) }
  var storedToken: String? { defaults.string(forKey: Self.tokenKey) }

  func saveSession(sameUser: Bool = true) throws -> NativeRequestAuthorization {
    NativeSessionTokenStore.save(
      token: sameUser ? "session-a" : "session-b",
      userID: sameUser ? "user-a" : "user-b",
      expiresAt: Date().addingTimeInterval(3_600)
    )
    return try #require(NativeSessionTokenStore.requestAuthorization())
  }
}

@Suite(.serialized)
@MainActor
struct PushNotificationManagerTests {
  @Test(arguments: [false, true], [false, true])
  func staleSettingsCannotAffectReplacementBeforeItsActivation(
    sameUser: Bool, authorized: Bool
  ) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let harness = PushLifecycleHarness()
      defer { harness.cleanup() }
      _ = try harness.saveSession()
      harness.defaults.set("old-apns", forKey: PushLifecycleHarness.tokenKey)
      let gate = PushLifecycleGate()
      harness.status = { await gate.wait() ? .authorized : .denied }
      let oldActivation = Task { await harness.manager.activate() }
      await gate.waitUntilEntered()
      let replacement = try harness.saveSession(sameUser: sameUser)
      await gate.complete(authorized)
      await oldActivation.value
      #expect(harness.registerCount == 0)
      #expect(harness.unregisterCount == 0)
      #expect(harness.storedToken == "old-apns")
      let oldRequests = await harness.service.requests()
      #expect(oldRequests.uploads.isEmpty && oldRequests.deletions.isEmpty)

      harness.status = { .authorized }
      await harness.manager.activate()
      let currentRequests = await harness.service.requests()
      #expect(harness.registerCount == 1)
      #expect(currentRequests.uploads == [.init(token: "old-apns", authorization: replacement)])
      #expect(NativeSessionTokenStore.requestAuthorization() == replacement)
    }
  }

  @Test(arguments: [false, true])
  func obsoleteOwnerCannotDeactivateReplacementBeforeItsActivation(sameUser: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let harness = PushLifecycleHarness()
      defer { harness.cleanup() }
      _ = try harness.saveSession()
      await harness.manager.activate()
      await harness.manager.didRegister(deviceToken: Data([0xAA]))
      let before = await harness.service.requests()
      let replacement = try harness.saveSession(sameUser: sameUser)
      await harness.manager.deactivate()
      let rejected = await harness.service.requests()
      #expect(harness.registerCount == 1)
      #expect(harness.unregisterCount == 0)
      #expect(harness.storedToken == "aa")
      #expect(rejected.uploads == before.uploads && rejected.deletions.isEmpty)
      #expect(NativeSessionTokenStore.requestAuthorization() == replacement)

      await harness.manager.activate()
      let active = await harness.service.requests()
      #expect(harness.registerCount == 2)
      #expect(active.uploads.last == PushLifecycleService.Request(token: "aa", authorization: replacement))
      #expect(active.deletions.isEmpty)
    }
  }

  @Test(arguments: [false, true])
  func stalePermissionCannotReviveRegistrationAfterExpiryAndReplacement(approved: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let harness = PushLifecycleHarness()
      defer { harness.cleanup() }
      _ = try harness.saveSession()
      harness.defaults.set("old-apns", forKey: PushLifecycleHarness.tokenKey)
      let gate = PushLifecycleGate()
      harness.status = { .notDetermined }
      harness.permission = { await gate.wait() }
      let oldActivation = Task { await harness.manager.activate() }
      await gate.waitUntilEntered()
      NativeSessionTokenStore.clear()
      await harness.manager.deactivate()
      #expect(harness.unregisterCount == 1)
      #expect(harness.storedToken == nil)
      #expect(await harness.service.requests().deletions.isEmpty)

      let replacement = try harness.saveSession()
      harness.status = { .authorized }
      await harness.manager.activate()
      await harness.manager.didRegister(deviceToken: Data([0xBB]))
      await gate.complete(approved)
      await oldActivation.value
      let requests = await harness.service.requests()
      #expect(harness.registerCount == 1)
      #expect(harness.unregisterCount == 1)
      #expect(harness.storedToken == "bb")
      #expect(requests.uploads == [.init(token: "bb", authorization: replacement)])
      #expect(requests.deletions.isEmpty)
      #expect(NativeSessionTokenStore.requestAuthorization() == replacement)
    }
  }

  @Test(arguments: [false, true], [false, true])
  func lateDeleteCannotUnregisterOrRemoveReplacementToken(
    sameUser: Bool, succeeds: Bool
  ) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let harness = PushLifecycleHarness()
      defer { harness.cleanup() }
      let original = try harness.saveSession()
      await harness.manager.activate()
      await harness.manager.didRegister(deviceToken: Data([0xAA]))
      let gate = PushLifecycleGate()
      await harness.service.holdDelete(gate)
      let oldCleanup = Task { await harness.manager.deactivate() }
      await gate.waitUntilEntered()
      let replacement = try harness.saveSession(sameUser: sameUser)
      await harness.manager.activate()
      await harness.manager.didRegister(deviceToken: Data([0xBB]))
      let before = await harness.service.requests()
      #expect(before.deletions == [.init(token: "aa", authorization: original)])
      #expect(before.uploads.last == PushLifecycleService.Request(token: "bb", authorization: replacement))
      await gate.complete(succeeds)
      await oldCleanup.value
      let after = await harness.service.requests()
      #expect(harness.registerCount == 2)
      #expect(harness.unregisterCount == 0)
      #expect(harness.storedToken == "bb")
      #expect(after.uploads == before.uploads && after.deletions == before.deletions)
      #expect(NativeSessionTokenStore.requestAuthorization() == replacement)
    }
  }

  @Test func bearerRotationKeepsPendingActivationOwnedAndUploadsTheCurrentBearer() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let harness = PushLifecycleHarness()
      defer { harness.cleanup() }
      let original = try harness.saveSession()
      let ownership = NativeSessionTokenStore.captureSessionContext().ownership
      harness.defaults.set("old-apns", forKey: PushLifecycleHarness.tokenKey)
      let gate = PushLifecycleGate()
      harness.status = { await gate.wait() ? .authorized : .denied }
      let activation = Task { await harness.manager.activate() }
      await gate.waitUntilEntered()
      let response = try #require(HTTPURLResponse(
        url: URL(string: "https://jov.ie/api/mobile/v1/me")!, statusCode: 200,
        httpVersion: nil, headerFields: ["set-auth-token": "rotated-a"]
      ))
      NativeSessionTokenStore.refresh(from: response, authorizedBy: original)
      let current = try #require(NativeSessionTokenStore.requestAuthorization())
      #expect(current.bearerToken == "rotated-a")
      #expect(NativeSessionTokenStore.isCurrent(ownership))
      await gate.complete(true)
      await activation.value
      let requests = await harness.service.requests()
      #expect(harness.registerCount == 1)
      #expect(harness.unregisterCount == 0)
      #expect(requests.uploads == [.init(token: "old-apns", authorization: current)])
      #expect(requests.deletions.isEmpty)
    }
  }

  @Test(arguments: [false, true])
  func cleanupWorksForCurrentAndAlreadyExpiredOwnersWithoutDelegateResurrection(signedOut: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let harness = PushLifecycleHarness()
      defer { harness.cleanup() }
      let original = try harness.saveSession()
      await harness.manager.activate()
      await harness.manager.didRegister(deviceToken: Data([0xAA]))
      if signedOut { NativeSessionTokenStore.clear() }
      await harness.manager.deactivate()
      let before = await harness.service.requests()
      #expect(harness.registerCount == 1)
      #expect(harness.unregisterCount == 1)
      #expect(harness.storedToken == nil)
      #expect(before.uploads == [.init(token: "aa", authorization: original)])
      #expect(before.deletions == (signedOut ? [] : [.init(token: "aa", authorization: original)]))
      await harness.manager.didRegister(deviceToken: Data([0xCC]))
      let after = await harness.service.requests()
      #expect(harness.storedToken == nil)
      #expect(after.uploads == before.uploads && after.deletions == before.deletions)
      #expect(NativeSessionTokenStore.requestAuthorization() == (signedOut ? nil : original))
      if signedOut {
        var settingsRequested = false
        harness.status = {
          settingsRequested = true
          return .authorized
        }
        await harness.manager.activate()
        #expect(!settingsRequested)
        #expect(harness.registerCount == 1)
        #expect(harness.storedToken == nil)
        let emptyActivation = await harness.service.requests()
        #expect(emptyActivation.uploads == before.uploads && emptyActivation.deletions.isEmpty)
      }
    }
  }

  @Test(arguments: [false, true])
  func lateUploadCompletionCannotChangeReplacementRegistration(succeeds: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let harness = PushLifecycleHarness()
      defer { harness.cleanup() }
      let original = try harness.saveSession()
      await harness.manager.activate()
      let gate = PushLifecycleGate()
      await harness.service.holdUpload(gate)
      let oldUpload = Task { await harness.manager.didRegister(deviceToken: Data([0xAA])) }
      await gate.waitUntilEntered()
      let replacement = try harness.saveSession()
      await harness.manager.activate()
      await harness.manager.didRegister(deviceToken: Data([0xBB]))
      let before = await harness.service.requests()
      #expect(before.uploads.first == PushLifecycleService.Request(token: "aa", authorization: original))
      #expect(before.uploads.last == PushLifecycleService.Request(token: "bb", authorization: replacement))
      await gate.complete(succeeds)
      await oldUpload.value
      let after = await harness.service.requests()
      #expect(harness.registerCount == 2)
      #expect(harness.unregisterCount == 0)
      #expect(harness.storedToken == "bb")
      #expect(after.uploads == before.uploads && after.deletions == before.deletions)
      #expect(NativeSessionTokenStore.requestAuthorization() == replacement)
    }
  }
}

// Profile requests can finish without entering their gate when deduplication is wrong.
// Buffer release so failure cleanup also drains a later, incorrectly started load.
actor ProfileLoadGate {
  private var result: Bool?
  private var completion: CheckedContinuation<Bool, Never>?
  private var entered: Bool?
  private var entryObserver: CheckedContinuation<Bool, Never>?

  func wait() async -> Bool {
    entered = true
    entryObserver?.resume(returning: true)
    entryObserver = nil
    if let result { return result }
    return await withCheckedContinuation { completion = $0 }
  }

  @discardableResult
  func waitUntilEntered() async -> Bool {
    if let entered { return entered }
    return await withCheckedContinuation { entryObserver = $0 }
  }

  func ownerFinished() {
    guard entered == nil else { return }
    entered = false
    entryObserver?.resume(returning: false)
    entryObserver = nil
  }

  func complete(_ result: Bool) {
    self.result = result
    completion?.resume(returning: result)
    completion = nil
  }
}

private actor ControlledProfileRepository: AppStateRepository {
  private let firstCacheGate: ProfileLoadGate?
  private let loadGates: [ProfileLoadGate]
  private let firstResult: Result<MeRepositoryResult, Error>
  private let validatesOwner: Bool
  private var cacheCalls = 0
  private var loadCalls = 0
  private var cleared: [String] = []

  init(
    firstCacheGate: ProfileLoadGate? = nil,
    loadGates: [ProfileLoadGate],
    firstResult: Result<MeRepositoryResult, Error> = .success(
      MeRepositoryResult(response: .previewReady, isStale: false)
    ),
    validatesOwner: Bool = false
  ) {
    self.validatesOwner = validatesOwner
    self.firstCacheGate = firstCacheGate
    self.loadGates = loadGates
    self.firstResult = firstResult
  }

  func cachedSnapshot(for userID: String) async -> MobileMeResponse? {
    cacheCalls += 1
    guard cacheCalls == 1, let firstCacheGate else { return nil }
    _ = await firstCacheGate.wait()
    return .previewNeedsOnboarding
  }

  func loadMe(for userID: String) async throws -> MeRepositoryResult {
    try await loadMe(for: userID, owner: nil)
  }

  func loadMe(for userID: String, ifOwnedBy owner: NativeSessionOwnership) async throws -> MeRepositoryResult {
    try await loadMe(for: userID, owner: validatesOwner ? owner : nil)
  }

  private func loadMe(for userID: String, owner: NativeSessionOwnership?) async throws -> MeRepositoryResult {
    let index = loadCalls
    loadCalls += 1
    // Unexpected duplicate loads fail promptly instead of leaving a test suspended.
    guard index < loadGates.count else { throw APIClientError.invalidResponse }
    _ = await loadGates[index].wait()
    if let owner { _ = try NativeSessionTokenStore.ownedRequestAuthorization(ifOwnedBy: owner, for: userID) }
    if index == 0 { return try firstResult.get() }
    return MeRepositoryResult(response: .previewReady, isStale: false)
  }

  func clearCachedUser(_ userID: String) { cleared.append(userID) }
  func clearCachedUser(_ userID: String, ifOwnedBy ownership: NativeSessionOwnership) {
    NativeSessionTokenStore.performIfCurrent(ownership) { cleared.append(userID) }
  }
  func loadCount() -> Int { loadCalls }
  func clearedUsers() -> [String] { cleared }
}

// Keep these in the existing serialized AppState suite: its observability fixtures
// also share a process-wide provider with live profile loading.
extension AppStateTests {
  private func saveSession() throws -> NativeRequestAuthorization {
    NativeSessionTokenStore.save(
      token: "same-token", userID: "same-user", expiresAt: Date().addingTimeInterval(3_600)
    )
    return try #require(NativeSessionTokenStore.requestAuthorization())
  }

  private func makeState(
    _ repository: ControlledProfileRepository,
    sessionRevoker: NativeSessionRevoking? = nil,
    capture: @escaping (String) -> ProfileLoadContext? = ProfileLoadContext.live
  ) -> AppState {
    let state = AppState(
      configuration: .mock, launchMode: .live, repository: repository,
      brightnessManager: MockBrightnessController(), sessionRevoker: sessionRevoker,
      captureProfileLoadCurrentness: capture
    )
    state.didInitializeAuth = true
    return state
  }

  @Test func oldCachedSnapshotCannotPaintOverSameUserReplacementOrReleaseItsLoad() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let cacheGate = ProfileLoadGate()
      let replacementLoad = ProfileLoadGate()
      let repository = ControlledProfileRepository(firstCacheGate: cacheGate, loadGates: [replacementLoad])
      let state = makeState(repository)
      let oldTask = Task { await state.handleSignedInUserChange("same-user") }
      await cacheGate.waitUntilEntered()
      let replacement = try saveSession()
      let newTask = Task {
        await state.handleSignedInUserChange("same-user")
        await replacementLoad.ownerFinished()
      }
      let entered = await replacementLoad.waitUntilEntered()
      #expect(entered, "A replacement login must start its own profile load")
      guard entered else {
        await cacheGate.complete(true)
        await replacementLoad.complete(true)
        await oldTask.value
        await newTask.value
        return
      }
      await cacheGate.complete(true)
      await oldTask.value
      #expect(state.route == .ready)
      #expect(state.dashboardState == .loading)
      #expect(!state.isOffline)
      await state.handleSignedInUserChange("same-user")
      #expect(await repository.loadCount() == 1)
      await replacementLoad.complete(true)
      await newTask.value
      #expect(state.dashboardState == .loaded(.previewReady))
      #expect(NativeSessionTokenStore.requestAuthorization() == replacement)
    }
  }

  enum ProfileCompletion: CaseIterable, Sendable { case success, transport, superseded, cancelled }

  @Test(arguments: ProfileCompletion.allCases)
  func oldNetworkCompletionCannotPublishOrClearSameUserReplacementLoad(completion: ProfileCompletion) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let original = try saveSession()
      let oldLoad = ProfileLoadGate()
      let newLoad = ProfileLoadGate()
      let firstResult: Result<MeRepositoryResult, Error>
      switch completion {
      case .success: firstResult = .success(MeRepositoryResult(response: .previewNeedsOnboarding, isStale: true))
      case .transport: firstResult = .failure(APIClientError.transportFailed(code: -1009))
      case .superseded: firstResult = .failure(NativeSessionRequestError.superseded)
      case .cancelled: firstResult = .failure(CancellationError())
      }
      let repository = ControlledProfileRepository(loadGates: [oldLoad, newLoad], firstResult: firstResult)
      let state = makeState(repository)
      let oldTask = Task { await state.handleSignedInUserChange("same-user") }
      await oldLoad.waitUntilEntered()
      #expect(state.activeSessionOwnership == original.ownership)
      let replacement = try saveSession()
      let newTask = Task {
        await state.handleSignedInUserChange("same-user")
        await newLoad.ownerFinished()
      }
      let entered = await newLoad.waitUntilEntered()
      #expect(entered, "A replacement login must not be deduplicated against the old load")
      guard entered else {
        await oldLoad.complete(true)
        await newLoad.complete(true)
        await oldTask.value
        await newTask.value
        return
      }
      #expect(state.activeSessionOwnership == replacement.ownership)
      #expect(state.activeSessionOwnership != original.ownership)
      // A mismatched callback must not replace B's pending attempt or its dedupe marker.
      await state.handleSignedInUserChange("obsolete-user")
      #expect(state.activeUserID == "same-user")
      await oldLoad.complete(true)
      await oldTask.value
      #expect(state.activeSessionOwnership == replacement.ownership)
      #expect(state.route == .ready)
      #expect(state.dashboardState == .loading)
      #expect(!state.isOffline)
      // A's defer must not release B's dedupe marker while B is still suspended.
      await state.handleSignedInUserChange("same-user")
      #expect(await repository.loadCount() == 2)
      await newLoad.complete(true)
      await newTask.value
      #expect(state.dashboardState == .loaded(.previewReady))
      #expect(NativeSessionTokenStore.requestAuthorization() == replacement)
    }
  }

  enum PendingProfilePhase: CaseIterable, Sendable { case cache, success, transportFailure }

  @Test(arguments: PendingProfilePhase.allCases)
  func replacementLoginRejectsOldWorkBeforeItsProfileLoadBegins(phase: PendingProfilePhase) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let gate = ProfileLoadGate()
      let firstResult: Result<MeRepositoryResult, Error> = phase == .transportFailure
        ? .failure(APIClientError.transportFailed(code: URLError.notConnectedToInternet.rawValue))
        : .success(MeRepositoryResult(response: .previewNeedsOnboarding, isStale: true))
      let repository = ControlledProfileRepository(
        firstCacheGate: phase == .cache ? gate : nil,
        loadGates: phase == .cache ? [] : [gate], firstResult: firstResult
      )
      let state = makeState(repository)
      let task = Task { await state.handleSignedInUserChange("same-user") }
      await gate.waitUntilEntered()
      let priorRoute = state.route
      let priorDashboard = state.dashboardState
      let replacement = try saveSession()
      // No B load has replaced A's attempt ID: rejection requires the native owner check.
      await gate.complete(true)
      await task.value
      #expect(state.route == priorRoute)
      #expect(state.dashboardState == priorDashboard)
      #expect(!state.isOffline)
      #expect(await repository.loadCount() == (phase == .cache ? 0 : 1))
      #expect(NativeSessionTokenStore.requestAuthorization() == replacement)
    }
  }

  @Test func bearerRotationKeepsTheSameProfileLoadCurrentAndDeduplicated() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let original = try saveSession()
      let gate = ProfileLoadGate()
      let repository = ControlledProfileRepository(loadGates: [gate])
      let state = makeState(repository)
      let task = Task { await state.handleSignedInUserChange("same-user") }
      await gate.waitUntilEntered()
      let response = try #require(HTTPURLResponse(
        url: URL(string: "https://jov.ie/api/mobile/v1/me")!, statusCode: 200,
        httpVersion: nil, headerFields: ["set-auth-token": "rotated-token"]
      ))
      NativeSessionTokenStore.refresh(from: response, authorizedBy: original)
      await state.handleSignedInUserChange("same-user")
      #expect(await repository.loadCount() == 1)
      #expect(state.activeSessionOwnership == original.ownership)
      await gate.complete(true)
      await task.value
      #expect(state.route == .ready)
      #expect(state.dashboardState == .loaded(.previewReady))
      #expect(NativeSessionTokenStore.load()?.token == "rotated-token")
      await state.handleSignedInUserChange(nil)
      #expect(state.activeSessionOwnership == nil)
    }
  }

  @Test(arguments: [APIClientError.missingToken, .requestFailed(statusCode: 401)])
  func unprovenTerminalFailureCannotExpireAnOwnedProfile(error: APIClientError) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let gate = ProfileLoadGate()
      let repository = ControlledProfileRepository(loadGates: [gate], firstResult: .failure(error))
      let revoker = MockSessionRevoker(result: .revoked)
      let state = makeState(repository, sessionRevoker: revoker)
      let task = Task { await state.handleSignedInUserChange("same-user") }
      await gate.waitUntilEntered()
      let context = NativeSessionTokenStore.captureSessionContext()
      await gate.complete(true)
      await task.value
      #expect(state.route == .ready)
      #expect(state.dashboardState == .error("Couldn't load your profile."))
      #expect(state.activeUserID == "same-user")
      #expect(!state.isOffline)
      #expect(await repository.clearedUsers().isEmpty)
      #expect(await revoker.calls() == 0)
      #expect(NativeSessionTokenStore.captureSessionContext() == context)
    }
  }
}

extension AppStateTests {
  private func expirePersistedSession() {
    // Advance only expiry metadata: saving an expired token would create a new login.
    UserDefaults.standard.set(1, forKey: "ie.jov.Jovie.nativeSession.expiresAt")
  }

  enum PassiveExpiryPhase: CaseIterable, Sendable { case beforeCapture, cacheAwait, externalCacheReader }

  @Test(arguments: PassiveExpiryPhase.allCases, [false, true])
  func passiveExpiryKeepsProfileLoadingOnItsExistingResultPath(phase: PassiveExpiryPhase, managed: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let owner = NativeSessionTokenStore.captureSessionContext().ownership
      let cacheGate = ProfileLoadGate()
      let loadGate = ProfileLoadGate()
      let repository = ControlledProfileRepository(
        firstCacheGate: cacheGate, loadGates: [loadGate], validatesOwner: true
      )
      let revoker = MockSessionRevoker(result: .revoked)
      let state = makeState(repository, sessionRevoker: revoker, capture: { userID in
        managed ? ProfileLoadContext.live(for: userID) : ProfileLoadContext.unmanaged()
      })
      if phase == .beforeCapture { expirePersistedSession() }
      let task = Task {
        await state.handleSignedInUserChange("same-user")
        await cacheGate.ownerFinished()
        await loadGate.ownerFinished()
      }
      #expect(await cacheGate.waitUntilEntered())
      if phase != .beforeCapture { expirePersistedSession() }
      if phase == .externalCacheReader { #expect(NativeSessionTokenStore.load() == nil) }
      await cacheGate.complete(true)
      let entered = await loadGate.waitUntilEntered()
      #expect(entered, "Passive expiry must still reach the existing profile result/terminal path")
      if entered, phase != .externalCacheReader {
        #expect(UserDefaults.standard.double(forKey: "ie.jov.Jovie.nativeSession.expiresAt") == 1)
      }
      // Buffered release also drains the task when a regressed owner check skips loadMe.
      await loadGate.complete(true)
      await task.value
      #expect(state.route == (!managed ? .ready : .signedOut))
      #expect(state.dashboardState == (!managed ? .loaded(.previewReady) : .idle))
      #expect(state.activeUserID == (!managed ? "same-user" : nil))
      #expect(!state.isOffline)
      #expect(await repository.clearedUsers() == (!managed ? [] : ["same-user"]))
      #expect(await revoker.calls() == 0)
      #expect(NativeSessionTokenStore.requestAuthorization() == nil)
      #expect(NativeSessionTokenStore.canContinueProfileLoad(ownedBy: owner))
    }
  }

  enum AfterPassiveExpiry: CaseIterable, Sendable { case explicitClear, sameUserLogin, replacementExpires }

  @Test(arguments: AfterPassiveExpiry.allCases)
  func passiveExpiryContinuationCannotSurviveAnExplicitOwnershipChange(change: AfterPassiveExpiry) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let original = NativeSessionTokenStore.captureSessionContext().ownership
      expirePersistedSession()
      #expect(NativeSessionTokenStore.load() == nil)
      #expect(NativeSessionTokenStore.canContinueProfileLoad(ownedBy: original))
      #expect(!NativeSessionTokenStore.isCurrent(original))
      #expect(NativeSessionTokenStore.requestAuthorization(ifOwnedBy: original) == nil)
      if change == .explicitClear {
        NativeSessionTokenStore.clear()
      } else {
        _ = try saveSession() // Identical user and bearer still replace login ownership.
        let replacement = NativeSessionTokenStore.captureSessionContext().ownership
        if change == .replacementExpires {
          expirePersistedSession()
          #expect(NativeSessionTokenStore.load() == nil)
        }
        #expect(NativeSessionTokenStore.canContinueProfileLoad(ownedBy: replacement))
      }
      let context = NativeSessionTokenStore.captureSessionContext()
      #expect(!NativeSessionTokenStore.canContinueProfileLoad(ownedBy: original))
      #expect(NativeSessionTokenStore.captureSessionContext() == context)
    }
  }
}

private protocol CleanupTestCache: Actor {
  func remove(for userID: String, ifOwnedBy ownership: NativeSessionOwnership)
}

extension MeCache: CleanupTestCache {}
extension ChatCache: CleanupTestCache {}
extension AudienceHighlightsCache: CleanupTestCache {}
extension ActionLoopCache: CleanupTestCache {}

private extension CleanupTestCache {
  func removeAfterEntry(for userID: String, ownership: NativeSessionOwnership, gate: ProfileLoadGate) async {
    _ = await gate.wait()
    remove(for: userID, ifOwnedBy: ownership)
  }
}

@MainActor
private final class CleanupCacheHarness {
  let userID = "same-user"
  let suiteName: String
  let defaults: UserDefaults
  let me: MeCache
  let chat: ChatCache
  let audience: AudienceHighlightsCache
  let actionLoop: ActionLoopCache
  let api = MutableAPIClient(mode: .success(.previewReady))

  init() {
    let name = "OwnedCacheCleanup-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: name)!
    suiteName = name
    self.defaults = defaults
    me = MeCache(defaults: defaults)
    chat = ChatCache(defaults: defaults)
    audience = AudienceHighlightsCache(defaults: defaults)
    actionLoop = ActionLoopCache(defaults: defaults)
  }

  func cleanup() { defaults.removePersistentDomain(forName: suiteName) }

  func seed(profile: MobileMeResponse = .previewReady) async {
    await me.store(profile, for: userID)
    await audience.store(.preview, for: userID)
    await actionLoop.storeCalendar(.preview, for: userID)
    for workspace in [MobileWorkspaceMode.jovie, .ovie] {
      await chat.store(makeChatSnapshot(), for: userID, workspace: workspace)
      await actionLoop.storeInbox(.preview, for: userID, workspace: workspace)
    }
  }

  func expectContents(present: Bool, profile: MobileMeResponse = .previewReady) async {
    // Read both warm actors and new instances: memory alone can hide a disk deletion.
    for cache in [me, MeCache(defaults: defaults)] {
      #expect(await cache.load(for: userID)?.response == (present ? profile : nil))
    }
    for cache in [audience, AudienceHighlightsCache(defaults: defaults)] {
      #expect(await cache.load(for: userID)?.response == (present ? .preview : nil))
    }
    for cache in [chat, ChatCache(defaults: defaults)] {
      for workspace in [MobileWorkspaceMode.jovie, .ovie] {
        #expect(await cache.load(for: userID, workspace: workspace) == (present ? makeChatSnapshot() : nil))
      }
    }
    for cache in [actionLoop, ActionLoopCache(defaults: defaults)] {
      #expect(await cache.loadCalendar(for: userID) == (present ? .preview : nil))
      for workspace in [MobileWorkspaceMode.jovie, .ovie] {
        #expect(await cache.loadInbox(for: userID, workspace: workspace) == (present ? .preview : nil))
      }
    }
  }
}

private struct DelayedCleanupRepository: AppStateRepository {
  let base: MeRepository
  let gate: ProfileLoadGate

  func loadMe(for userID: String) async throws -> MeRepositoryResult { try await base.loadMe(for: userID) }
  func loadMe(for userID: String, ifOwnedBy owner: NativeSessionOwnership) async throws -> MeRepositoryResult {
    try await base.loadMe(for: userID, ifOwnedBy: owner)
  }
  func cachedSnapshot(for userID: String) async -> MobileMeResponse? { await base.cachedSnapshot(for: userID) }
  func clearCachedUser(_ userID: String) async {
    // Also observe the legacy path so an unguarded-call regression fails instead of hanging.
    _ = await gate.wait()
    await base.clearCachedUser(userID)
  }
  func clearCachedUser(_ userID: String, ifOwnedBy ownership: NativeSessionOwnership) async {
    _ = await gate.wait()
    await base.clearCachedUser(userID, ifOwnedBy: ownership)
  }
}

extension AppStateTests {
  @Test(arguments: [false, true])
  func actorCleanupRejectsReplacementOwnershipAndOtherwiseRemovesEveryScope(replaceSession: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let harness = CleanupCacheHarness()
      defer { harness.cleanup() }
      _ = try saveSession()
      await harness.seed()
      NativeSessionTokenStore.clear()
      let owner = NativeSessionTokenStore.captureSessionContext().ownership
      let caches: [any CleanupTestCache] = [harness.me, harness.chat, harness.audience, harness.actionLoop]
      let userID = harness.userID
      let gates = caches.map { _ in ProfileLoadGate() }
      let tasks = zip(caches, gates).map { cache, gate in
        Task { await cache.removeAfterEntry(for: userID, ownership: owner, gate: gate) }
      }
      for gate in gates { await gate.waitUntilEntered() }
      if replaceSession {
        _ = try saveSession() // Same user and bearer, different login ownership.
        await harness.seed(profile: .previewNeedsOnboarding)
      }
      let context = NativeSessionTokenStore.captureSessionContext()
      for gate in gates { await gate.complete(true) }
      for task in tasks { await task.value }
      await harness.expectContents(present: replaceSession, profile: .previewNeedsOnboarding)
      #expect(NativeSessionTokenStore.captureSessionContext() == context)
    }
  }

  enum CleanupTrigger: CaseIterable, Sendable { case signOut, legacyExpiry, receipt }

  @Test(arguments: [false, true], CleanupTrigger.allCases)
  func appStateCleanupRetainsOneOwnerAcrossEveryAwait(replaceSession: Bool, trigger: CleanupTrigger) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let harness = CleanupCacheHarness()
      defer { harness.cleanup() }
      let authorization = try saveSession()
      await harness.seed()
      let gate = ProfileLoadGate()
      let repository = DelayedCleanupRepository(base: MeRepository(apiClient: harness.api, cache: harness.me), gate: gate)
      let revoker = MockSessionRevoker(result: .revoked)
      let state = AppState(
        configuration: .mock, launchMode: .live, repository: repository,
        brightnessManager: MockBrightnessController(), sessionRevoker: revoker,
        chatCache: harness.chat, audienceHighlightsCache: harness.audience, actionLoopCache: harness.actionLoop
      )
      state.didInitializeAuth = true
      await state.handleSignedInUserChange(harness.userID)
      let receipt = trigger == .receipt ? try ownedProfileExpiryReceipt(authorization) : nil
      let cleanup = Task {
        if let receipt { await state.handleExpiredSession(receipt) }
        else if trigger == .legacyExpiry { await state.handleExpiredSession() }
        else { await state.signOut() }
        await gate.ownerFinished()
      }
      let entered = await gate.waitUntilEntered()
      #expect(entered, "AppState must forward cleanup through the profile repository")
      guard entered else {
        await gate.complete(true)
        await cleanup.value
        return
      }
      #expect(state.route == .signedOut)
      if replaceSession {
        _ = try saveSession()
        await harness.seed(profile: .previewNeedsOnboarding)
        await harness.api.updateMode(.success(.previewNeedsOnboarding))
        await state.handleSignedInUserChange(harness.userID)
      }
      let context = NativeSessionTokenStore.captureSessionContext()
      await gate.complete(true)
      await cleanup.value
      await harness.expectContents(present: replaceSession, profile: .previewNeedsOnboarding)
      #expect(state.route == (replaceSession ? .needsOnboarding : .signedOut))
      #expect(state.activeUserID == (replaceSession ? harness.userID : nil))
      #expect(await revoker.calls() == (trigger == .signOut ? 1 : 0))
      #expect(NativeSessionTokenStore.captureSessionContext() == context)
    }
  }
}

@MainActor
private struct AwaitedProfilePush: PushNotificationCoordinating {
  let manager: PushNotificationManager
  let activated = ProfileLoadGate()
  func activate() async { await manager.activate(); await activated.complete(true) }
  func deactivate() async { await manager.deactivate() }
  func deactivateLocally(ifOwnedBy owner: NativeSessionOwnership) async {
    await manager.deactivateLocally(ifOwnedBy: owner)
  }
}

private final class OwnedProfileURLProtocol: URLProtocol {
  static var requests: [URLRequest] = []
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    Self.requests.append(request)
    client?.urlProtocol(self, didReceive: HTTPURLResponse(
      url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil
    )!, cacheStoragePolicy: .notAllowed)
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

private struct PausedNativeProfileProvider: TokenProviding {
  let gate: ProfileLoadGate
  func bearerToken(forceRefresh: Bool) async throws -> String {
    try await requestAuthorization(forceRefresh: forceRefresh).bearerToken
  }
  func requestAuthorization(forceRefresh: Bool) async throws -> NativeRequestAuthorization {
    _ = await gate.wait()
    return try await NativeSessionTokenProvider().requestAuthorization(forceRefresh: forceRefresh)
  }
  func ownedRequestAuthorization(for userID: String, ifOwnedBy owner: NativeSessionOwnership) async throws -> NativeRequestAuthorization {
    _ = await gate.wait()
    return try await NativeSessionTokenProvider().ownedRequestAuthorization(for: userID, ifOwnedBy: owner)
  }
}

extension AppStateTests {
  enum OwnedProfileScenario: CaseIterable, Sendable { case current, replacement, wrongUserCallback }

  @Test(arguments: OwnedProfileScenario.allCases)
  func realOwnedProfileDispatchAndExpiryPreserveTheirOriginalLogin(scenario: OwnedProfileScenario) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let caches = CleanupCacheHarness()
      let push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup(); OwnedProfileURLProtocol.requests = [] }
      let authorization = try saveSession()
      if scenario == .wrongUserCallback {
        NativeSessionTokenStore.save(token: "other-login", userID: "other-user", expiresAt: .distantFuture)
        await caches.me.store(.previewNeedsOnboarding, for: "other-user")
      }
      await caches.seed()
      push.defaults.set("old-apns", forKey: PushLifecycleHarness.tokenKey)
      let gate = ProfileLoadGate()
      let configuration = URLSessionConfiguration.ephemeral
      configuration.protocolClasses = [OwnedProfileURLProtocol.self]
      let session = URLSession(configuration: configuration)
      defer { session.invalidateAndCancel() }
      let client = APIClient(baseURL: URL(string: "https://jov.ie")!, session: session,
                             tokenProvider: PausedNativeProfileProvider(gate: gate))
      let revoker = MockSessionRevoker(result: .revoked)
      let awaitedPush = AwaitedProfilePush(manager: push.manager)
      let state = AppState(configuration: .mock, launchMode: .live,
        repository: MeRepository(apiClient: client, cache: caches.me), brightnessManager: MockBrightnessController(),
        sessionRevoker: revoker, pushNotifications: awaitedPush, chatCache: caches.chat,
        audienceHighlightsCache: caches.audience, actionLoopCache: caches.actionLoop)
      state.didInitializeAuth = true
      if scenario == .wrongUserCallback {
        state.activeUserID = "other-user"
        state.route = .needsOnboarding
        state.dashboardState = .loaded(.previewNeedsOnboarding)
      }
      let task = Task {
        await state.handleSignedInUserChange(caches.userID)
        await gate.ownerFinished()
      }
      #expect(await gate.waitUntilEntered() == (scenario != .wrongUserCallback))
      if scenario != .wrongUserCallback { _ = await awaitedPush.activated.wait() }
      #expect(state.dashboardState == .loaded(scenario == .wrongUserCallback ? .previewNeedsOnboarding : .previewReady))
      if scenario == .replacement {
        NativeSessionTokenStore.save(token: "same-token", userID: caches.userID, expiresAt: .distantFuture)
        await caches.seed(profile: .previewNeedsOnboarding)
        push.defaults.set("new-apns", forKey: PushLifecycleHarness.tokenKey)
      }
      let context = NativeSessionTokenStore.captureSessionContext()
      await gate.complete(true)
      await task.value
      #expect(OwnedProfileURLProtocol.requests.count == (scenario == .current ? 1 : 0))
      #expect(state.route == (scenario == .current ? .signedOut : scenario == .replacement ? .ready : .needsOnboarding))
      #expect(state.dashboardState == (scenario == .current ? .idle
        : scenario == .replacement ? .loaded(.previewReady) : .loaded(.previewNeedsOnboarding)))
      #expect(!state.isOffline)
      await caches.expectContents(present: scenario != .current,
                                  profile: scenario == .replacement ? .previewNeedsOnboarding : .previewReady)
      if scenario == .wrongUserCallback {
        #expect(state.activeUserID == "other-user")
        #expect(push.registerCount == 0)
        #expect(await caches.me.load(for: "other-user")?.response == .previewNeedsOnboarding)
        #expect(await MeCache(defaults: caches.defaults).load(for: "other-user")?.response == .previewNeedsOnboarding)
      }
      #expect(push.unregisterCount == (scenario == .current ? 1 : 0))
      #expect(push.storedToken == (scenario == .current ? nil : scenario == .replacement ? "new-apns" : "old-apns"))
      #expect(await push.service.requests().deletions.isEmpty)
      #expect(await revoker.calls() == 0)
      if scenario != .current { #expect(NativeSessionTokenStore.captureSessionContext() == context) }
      else {
        let receipt = try ownedProfileExpiryReceipt(authorization)
        #expect(NativeSessionTokenStore.captureOwnership() == receipt.ownership)
        #expect(NativeSessionTokenStore.load() == nil)
      }
    }
  }

  @Test func staleReceiptCannotAffectSameUserReplacementBeforePushActivation() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let caches = CleanupCacheHarness()
      let push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      let authorization = try saveSession()
      await push.manager.activate()
      let receipt = try ownedProfileExpiryReceipt(authorization)
      _ = try saveSession()
      await caches.seed(profile: .previewNeedsOnboarding)
      await caches.api.updateMode(.success(.previewNeedsOnboarding))
      push.defaults.set("new-apns", forKey: PushLifecycleHarness.tokenKey)
      let awaitedPush = AwaitedProfilePush(manager: push.manager)
      let state = AppState(configuration: .mock, launchMode: .live,
        repository: MeRepository(apiClient: caches.api, cache: caches.me), brightnessManager: MockBrightnessController(),
        pushNotifications: awaitedPush, chatCache: caches.chat,
        audienceHighlightsCache: caches.audience, actionLoopCache: caches.actionLoop)
      // Deliver while the manager still belongs to A; B's activation has not run.
      await push.manager.deactivateLocally(ifOwnedBy: receipt.ownership)
      #expect(push.unregisterCount == 0)
      #expect(push.storedToken == "new-apns")
      state.didInitializeAuth = true
      await state.handleSignedInUserChange(caches.userID)
      _ = await awaitedPush.activated.wait()
      let context = NativeSessionTokenStore.captureSessionContext()
      await state.handleExpiredSession(receipt)
      #expect(state.route == .needsOnboarding)
      #expect(state.dashboardState == .loaded(.previewNeedsOnboarding))
      #expect(push.unregisterCount == 0)
      #expect(push.storedToken == "new-apns")
      #expect(await push.service.requests().deletions.isEmpty)
      await caches.expectContents(present: true, profile: .previewNeedsOnboarding)
      #expect(NativeSessionTokenStore.captureSessionContext() == context)
    }
  }

  @Test func authoritativeReceiptSurvivesReplacementOfTheSameLoginProfileAttempt() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let authorization = try saveSession()
      let owner = NativeSessionTokenStore.captureOwnership()
      let oldGate = ProfileLoadGate(), newGate = ProfileLoadGate()
      let repository = ControlledProfileRepository(loadGates: [oldGate, newGate], validatesOwner: true)
      var oldAttemptCurrent = true
      var captures = 0
      let state = makeState(repository, capture: { _ in
        captures += 1
        return ProfileLoadContext(ownership: owner, canContinue: captures == 1 ? { oldAttemptCurrent } : { true })
      })
      let oldTask = Task {
        await state.handleSignedInUserChange("same-user")
        await oldGate.ownerFinished()
      }
      let oldEntered = await oldGate.waitUntilEntered()
      #expect(oldEntered)
      guard oldEntered else {
        await oldGate.complete(true)
        await oldTask.value
        return
      }
      oldAttemptCurrent = false
      let newTask = Task {
        await state.handleSignedInUserChange("same-user")
        await newGate.ownerFinished()
      }
      let newEntered = await newGate.waitUntilEntered()
      #expect(newEntered)
      guard newEntered else {
        await oldGate.complete(true)
        await newGate.complete(true)
        await oldTask.value
        await newTask.value
        return
      }
      #expect((try? ownedProfileExpiryReceipt(authorization)) != nil)
      await oldGate.complete(true)
      await oldTask.value
      #expect(state.route == .signedOut, "A genuine receipt cannot be discarded by the old attempt-ID guard")
      await newGate.complete(true)
      await newTask.value
      #expect(state.activeUserID == nil)
      #expect(NativeSessionTokenStore.load() == nil)
    }
  }
}

@MainActor
private final class ChatReceiptPush: PushNotificationCoordinating {
  let manager: PushNotificationManager
  var activation = ProfileLoadGate()
  init(_ manager: PushNotificationManager) { self.manager = manager }
  func activate() async {
    let completion = activation
    await manager.activate()
    await completion.complete(true)
  }
  func waitForActivation() async -> Bool {
    let completion = activation
    let watchdog = Task {
      do { try await Task.sleep(for: .seconds(5)) } catch { return }
      await completion.complete(false)
    }
    let result = await completion.wait()
    watchdog.cancel()
    await watchdog.value
    return result
  }
  func deactivate() async { await manager.deactivate() }
  func deactivateLocally(ifOwnedBy owner: NativeSessionOwnership) async {
    await manager.deactivateLocally(ifOwnedBy: owner)
  }
}

extension AppStateTests {
  @Test(arguments: [false, true])
  func discardedWorkspaceRepositoryStillDeliversOnlyItsOriginalExpiry(replaceLogin: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let caches = CleanupCacheHarness()
      let push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      let original = try saveSession()
      let awaitedPush = ChatReceiptPush(push.manager)
      let state = AppState(configuration: .mock, launchMode: .live,
        repository: MeRepository(apiClient: caches.api, cache: caches.me), brightnessManager: MockBrightnessController(),
        pushNotifications: awaitedPush, chatCache: caches.chat,
        audienceHighlightsCache: caches.audience, actionLoopCache: caches.actionLoop)
      state.didInitializeAuth = true
      await state.handleSignedInUserChange(caches.userID)
      #expect(await awaitedPush.waitForActivation())
      push.defaults.set("old-apns", forKey: PushLifecycleHarness.tokenKey)
      let gate = ProfileLoadGate()
      let client = OwnedChatTestClient(original, gate: gate, operation: "list")
      var receiptDeliveries = 0
      @MainActor func make(_ identity: NativeChatIdentity) -> ChatRepository {
        ChatRepository(client: client, cache: caches.chat, userID: identity.userID,
          webBaseURL: URL(string: "https://jov.ie")!, identity: identity,
          onSessionExpired: { receipt in
            receiptDeliveries += 1
            await state.handleExpiredSession(receipt)
          })
      }
      let old = make(NativeChatIdentity(userID: caches.userID, ownership: state.activeSessionOwnership, workspace: .jovie))
      let request = Task { await old.refreshConversations(); await gate.ownerFinished() }
      #expect(await gate.waitUntilEntered())
      let visible = ChatRepository.resolve(old, for: NativeChatIdentity(
        userID: caches.userID, ownership: state.activeSessionOwnership, workspace: .ovie), create: make)
      #expect(visible !== old)
      let receipt: NativeSessionExpiryReceipt
      do { receipt = try ownedProfileExpiryReceipt(original) } catch {
        await gate.complete(true); await request.value
        throw error
      }
      if replaceLogin {
        _ = try saveSession()
        awaitedPush.activation = ProfileLoadGate()
        await caches.api.updateMode(.success(.previewNeedsOnboarding))
        await state.handleSignedInUserChange(caches.userID)
        #expect(await awaitedPush.waitForActivation())
        push.defaults.set("new-apns", forKey: PushLifecycleHarness.tokenKey)
      }
      await caches.seed(profile: replaceLogin ? .previewNeedsOnboarding : .previewReady)
      let expected = NativeSessionTokenStore.captureSessionContext()
      await client.fail(with: NativeSessionRequestError.expired(receipt))
      request.cancel()
      await gate.complete(true); await request.value
      #expect(receiptDeliveries == 1)
      #expect(state.route == (replaceLogin ? .needsOnboarding : .signedOut))
      #expect(state.activeSessionOwnership == (replaceLogin ? expected.ownership : nil))
      #expect(!visible.sessionExpired && !old.sessionExpired && !old.isOffline)
      #expect(push.unregisterCount == (replaceLogin ? 0 : 1))
      #expect(push.storedToken == (replaceLogin ? "new-apns" : nil))
      #expect(await push.service.requests().deletions.isEmpty)
      await caches.expectContents(present: replaceLogin, profile: .previewNeedsOnboarding)
      #expect(NativeSessionTokenStore.captureSessionContext() == expected)
    }
  }
}
