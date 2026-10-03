import AuthenticationServices
import Foundation
import JovieKit
import Security
import Testing
import UserNotifications
@testable import Jovie

/// Share the existing process-wide lease for one test case, with no nested acquisition.
private struct NativeSessionStoreScope: TestTrait, TestScoping {
  func provideScope(
    for _: Test, testCase _: Test.Case?, performing function: @Sendable () async throws -> Void
  ) async throws {
    try await withNativeSessionTokenStoreTestIsolation(function)
  }
}

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
  private var authorizations: [NativeRequestAuthorization?] = []
  private let gate: ProfileLoadGate?

  init(result: NativeSessionRevocationResult, gate: ProfileLoadGate? = nil) {
    self.result = result
    self.gate = gate
  }

  func revokeCurrentSession() async -> NativeSessionRevocationResult {
    callCount += 1
    return result
  }

  func revokeSession(authorizedBy authorization: NativeRequestAuthorization?) async -> NativeSessionRevocationResult {
    callCount += 1
    authorizations.append(authorization)
    if let gate { _ = await gate.wait() }
    return result
  }

  func capturedAuthorizations() -> [NativeRequestAuthorization?] { authorizations }

  func calls() -> Int {
    callCount
  }
}

extension AppStateTests {
  @MainActor
  private func cleanupState(
    _ caches: CleanupCacheHarness, push: PushLifecycleHarness, revoker: MockSessionRevoker
  ) -> AppState {
    let state = AppState(configuration: .mock, launchMode: .live,
      repository: MeRepository(apiClient: caches.api, cache: caches.me),
      brightnessManager: MockBrightnessController(), sessionRevoker: revoker,
      pushNotifications: push.manager, chatCache: caches.chat,
      audienceHighlightsCache: caches.audience, actionLoopCache: caches.actionLoop)
    state.didInitializeAuth = true
    state.activeUserID = caches.userID
    state.route = .ready
    return state
  }

  @Test(arguments: ["delete", "post"], ["current", "same", "different", "intent", "rotation", "nil-reset"])
  func logoutKeepsItsEntryAcrossPushAndRevocation(pause: String, change: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      let original = try saveSession()
      await caches.seed()
      push.defaults.set("apns-a", forKey: PushLifecycleHarness.tokenKey)
      await push.manager.activate()
      let gate = ProfileLoadGate()
      if pause == "delete" { await push.service.holdOwnedDelete(gate) }
      let revoker = MockSessionRevoker(result: .revoked, gate: pause == "post" ? gate : nil)
      let state = cleanupState(caches, push: push, revoker: revoker)
      let task = Task {
        let result = await state.signOut()
        await gate.ownerFinished()
        return result
      }
      let entered = await gate.waitUntilEntered()
      #expect(entered)
      guard entered else { await gate.complete(true); _ = await task.value; return }
      let replacement = ["same", "different", "intent"].contains(change)
      if change == "same" || change == "different" {
        let userID = change == "same" ? caches.userID : "different-user"
        NativeSessionTokenStore.save(token: change == "same" ? "same-token" : "different-token",
          userID: userID, expiresAt: .distantFuture)
        state.activeUserID = userID
        state.route = .needsOnboarding
        await caches.seed(profile: .previewNeedsOnboarding)
        push.defaults.set("apns-b", forKey: PushLifecycleHarness.tokenKey)
        await push.manager.activate()
      } else if change == "intent" {
        _ = NativeSessionTokenStore.claimCleanup(invalidatingAuthIntent: true)
      } else if change == "rotation" {
        NativeSessionTokenStore.refresh(from: HTTPURLResponse(url: URL(string: "https://jov.ie")!,
          statusCode: 200, httpVersion: nil, headerFields: ["set-auth-token": "rotated-a"])!, authorizedBy: original)
      } else if change == "nil-reset" {
        let beforeReset = NativeSessionTokenStore.captureSessionContext()
        let calls = await revoker.calls()
        await state.handleSignedInUserChange(nil)
        #expect(NativeSessionTokenStore.captureSessionContext() == beforeReset)
        #expect(await revoker.calls() == calls)
        await caches.expectContents(present: true)
      }
      let before = NativeSessionTokenStore.captureSessionContext()
      let route = state.route, userID = state.activeUserID, token = push.storedToken
      await gate.complete(true)
      let completion = await task.value
      let requests = await push.service.requests()
      #expect(requests.deletions.first?.authorization == original)
      let revocations = await revoker.capturedAuthorizations()
      let shouldPost = pause == "post" || !replacement
      #expect(revocations.count == (shouldPost ? 1 : 0))
      if let sent = revocations.first {
        #expect(sent?.bearerToken == (change == "rotation" && pause == "delete" ? "rotated-a" : "same-token"))
      }
      if replacement {
        #expect(completion == nil)
        #expect(NativeSessionTokenStore.captureSessionContext() == before)
        #expect(state.route == route && state.activeUserID == userID)
        #expect(push.storedToken == token)
        await caches.expectContents(present: true,
          profile: change == "intent" ? .previewReady : .previewNeedsOnboarding)
      } else {
        #expect(completion != nil)
        #expect(NativeSessionTokenStore.load() == nil)
        #expect(state.route == .signedOut && state.activeUserID == nil)
        #expect(push.storedToken == nil)
        // A nil-user reset during the await cannot erase the captured cache owner.
        await caches.expectContents(present: false)
      }
    }
  }

  @Test(arguments: ["delete", "post"], [false, true])
  func logoutNetworkFailureClearsOnlyItsCurrentOwner(pause: String, replace: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      _ = try saveSession()
      await caches.seed()
      push.defaults.set("apns-a", forKey: PushLifecycleHarness.tokenKey)
      await push.manager.activate()
      let gate = ProfileLoadGate()
      if pause == "delete" { await push.service.holdOwnedDelete(gate) }
      let revoker = MockSessionRevoker(result: .failed(statusCode: 503), gate: pause == "post" ? gate : nil)
      let state = cleanupState(caches, push: push, revoker: revoker)
      let task = Task { let result = await state.signOut(); await gate.ownerFinished(); return result }
      #expect(await gate.waitUntilEntered())
      if replace {
        NativeSessionTokenStore.save(token: "b", userID: caches.userID, expiresAt: .distantFuture)
        state.activeUserID = caches.userID
        state.route = .needsOnboarding
        await caches.seed(profile: .previewNeedsOnboarding)
        push.defaults.set("apns-b", forKey: PushLifecycleHarness.tokenKey)
        await push.manager.activate()
      }
      let before = NativeSessionTokenStore.captureSessionContext()
      await gate.complete(false)
      let completion = await task.value
      #expect((completion != nil) == !replace)
      #expect(state.route == (replace ? .needsOnboarding : .signedOut))
      #expect(push.storedToken == (replace ? "apns-b" : nil))
      #expect(await revoker.calls() == (replace && pause == "delete" ? 0 : 1))
      if replace { #expect(NativeSessionTokenStore.captureSessionContext() == before) }
      else { #expect(NativeSessionTokenStore.load() == nil) }
      await caches.expectContents(present: replace, profile: .previewNeedsOnboarding)
    }
  }

  @Test func returnedLogoutCompletionGuardsRootWritesAgainstIntentOnlyReplacement() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      let state = cleanupState(caches, push: push, revoker: MockSessionRevoker(result: .noSession))
      let completion = try #require(await state.signOut())
      var rootResets = 0
      #expect(NativeSessionTokenStore.performIfCurrent(completion, { rootResets += 1 }))
      let empty = NativeSessionTokenStore.captureSessionContext()
      _ = NativeSessionTokenStore.claimCleanup(invalidatingAuthIntent: true)
      #expect(NativeSessionTokenStore.captureSessionContext() == empty)
      #expect(!NativeSessionTokenStore.performIfCurrent(completion, { rootResets += 1 }))
      #expect(rootResets == 1)
    }
  }

  @Test(arguments: ["nil", "expiry"], [false, true])
  func localResetKeepsItsScopeAndCannotFinishOverReplacement(trigger: String, replace: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      _ = try saveSession()
      await caches.seed()
      push.defaults.set("apns-a", forKey: PushLifecycleHarness.tokenKey)
      await push.manager.activate()
      let gate = ProfileLoadGate()
      await push.service.holdOwnedDelete(gate)
      let revoker = MockSessionRevoker(result: .revoked)
      let state = cleanupState(caches, push: push, revoker: revoker)
      let task = Task {
        if trigger == "nil" { await state.handleSignedInUserChange(nil) }
        else { await state.handleExpiredSession() }
        await gate.ownerFinished()
      }
      let entered = await gate.waitUntilEntered()
      #expect(entered)
      guard entered else { await gate.complete(true); await task.value; return }
      if replace {
        NativeSessionTokenStore.save(token: "same-token", userID: caches.userID, expiresAt: .distantFuture)
        state.activeUserID = caches.userID
        state.route = .needsOnboarding
        await caches.seed(profile: .previewNeedsOnboarding)
        push.defaults.set("apns-b", forKey: PushLifecycleHarness.tokenKey)
        await push.manager.activate()
      }
      let before = NativeSessionTokenStore.captureSessionContext()
      await gate.complete(true)
      await task.value
      #expect(await revoker.calls() == 0)
      #expect(state.route == (replace ? .needsOnboarding : .signedOut))
      if replace || trigger == "nil" {
        #expect(NativeSessionTokenStore.captureSessionContext() == before)
      } else { #expect(NativeSessionTokenStore.load() == nil) }
      #expect(push.storedToken == (replace ? "apns-b" : nil))
      await caches.expectContents(present: replace || trigger == "nil",
        profile: replace ? .previewNeedsOnboarding : .previewReady)
    }
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

  @Test(NativeSessionStoreScope()) func mapsReadyResponseToReadyRoute() async throws {
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

  @Test(NativeSessionStoreScope()) func paintsCachedSnapshotInstantlyThenRevalidates() async throws {
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

  @Test(NativeSessionStoreScope()) func cachedSnapshotPaintDoesNotDuplicateNetworkLoad() async throws {
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

  @Test(NativeSessionStoreScope()) func mapsNeedsOnboardingResponseToNeedsOnboardingRoute() async throws {
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

  @Test(NativeSessionStoreScope()) func mapsWaitlistPendingResponseAwayFromProfileCompletion() async throws {
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

  @Test(NativeSessionStoreScope()) func coldProfileLoadShowsInteractiveShellBeforeNetworkReturns() async throws {
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

  @Test(NativeSessionStoreScope()) func cachedNeedsOnboardingSnapshotPreservesContinueOnWebURL() async throws {
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

    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      await appState.handleSignedInUserChange("user_123")
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

    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      await appState.handleSignedInUserChange("user_123")
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

    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      await appState.handleSignedInUserChange("user_123")
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

    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      await appState.handleSignedInUserChange(userID)
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

    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      await appState.handleSignedInUserChange(userID)
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

    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      await appState.handleSignedInUserChange(userID)
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

    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      await appState.handleSignedInUserChange(userID)
      await appState.handleExpiredSession()
    }

    #expect(appState.route == .signedOut)
    #expect(appState.activeUserID == nil)
    #expect(await audienceCache.load(for: userID) == nil)
    #expect(await actionLoopCache.loadInbox(for: userID) == nil)
    #expect(await actionLoopCache.loadCalendar(for: userID) == nil)
  }

  @Test(NativeSessionStoreScope()) func signedInUserSetsObservabilityUserID() async throws {
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
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
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
  }

  @Test(NativeSessionStoreScope()) func duplicateSignedInUserLoadIsIgnoredWhileInFlight() async throws {
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

    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      async let load: Void = appState.handleSignedInUserChange("user_123")
      try await Task.sleep(for: .milliseconds(10))
      await appState.signOut()
      _ = await load
    }

    #expect(appState.route == .signedOut)
    #expect(appState.dashboardState == .idle)
    #expect(appState.activeUserID == nil)
    #expect(await repository.clearedUsers() == ["user_123"])
  }

  @Test(NativeSessionStoreScope()) func profileLoadFailureShowsRecoveryStateAndRetryRestoresDashboard() async throws {
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

  @Test(NativeSessionStoreScope()) func coldOfflineProfileLoadShowsOfflineStateAndRetryClearsIt() async throws {
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

  @Test(NativeSessionStoreScope()) func staleProfileSnapshotShowsOfflineStateAndRetryClearsIt() async throws {
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
  private var ownedDeleteGate: ProfileLoadGate?

  func holdUpload(_ gate: PushLifecycleGate) { uploadGate = gate }
  func holdDelete(_ gate: PushLifecycleGate) { deleteGate = gate }
  func holdOwnedDelete(_ gate: ProfileLoadGate) { ownedDeleteGate = gate }
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
    if let gate = ownedDeleteGate {
      ownedDeleteGate = nil
      if !(await gate.wait()) { throw APIClientError.requestFailed(statusCode: 503) }
    }
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
  @Test(arguments: [false, true])
  func staleOwnedDeactivationCannotCancelReplacementRegistration(emptyClaim: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = PushLifecycleHarness()
      defer { h.cleanup() }
      _ = try h.saveSession()
      await h.manager.activate()
      if emptyClaim { NativeSessionTokenStore.clear() }
      let oldClaim = NativeSessionTokenStore.claimCleanup(invalidatingAuthIntent: true)
      let replacement = try h.saveSession(sameUser: false)
      h.defaults.set("apns-b", forKey: PushLifecycleHarness.tokenKey)
      let gate = ProfileLoadGate()
      h.status = { await gate.wait() ? .authorized : .denied }
      let activation = Task { await h.manager.activate(); await gate.ownerFinished() }
      #expect(await gate.waitUntilEntered())
      let unregistrations = h.unregisterCount
      await h.manager.deactivate(for: oldClaim)
      await gate.complete(true)
      await activation.value
      await h.manager.didRegister(deviceToken: Data([0xbb]))
      let requests = await h.service.requests()
      #expect(h.unregisterCount == unregistrations)
      #expect(h.storedToken == "bb")
      #expect(requests.deletions.isEmpty)
      #expect(requests.uploads.last?.authorization == replacement)
      #expect(requests.uploads.last?.token == "bb")
    }
  }

  @Test func currentEmptyClaimStillRemovesAnOldLocalRegistration() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let h = PushLifecycleHarness()
      defer { h.cleanup() }
      _ = try h.saveSession()
      h.defaults.set("apns-a", forKey: PushLifecycleHarness.tokenKey)
      await h.manager.activate()
      NativeSessionTokenStore.clear()
      let claim = NativeSessionTokenStore.claimCleanup(invalidatingAuthIntent: true)
      let before = NativeSessionTokenStore.captureSessionContext()
      let unregistrations = h.unregisterCount
      await h.manager.deactivate(for: claim)
      #expect(h.unregisterCount == unregistrations + 1)
      #expect(h.storedToken == nil)
      #expect(await h.service.requests().deletions.isEmpty)
      #expect(NativeSessionTokenStore.captureSessionContext() == before)
    }
  }

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
  private let firstCacheSnapshot: MobileMeResponse?
  private let loadGates: [ProfileLoadGate]
  private let firstResult: Result<MeRepositoryResult, Error>
  private let validatesOwner: Bool
  private var cacheCalls = 0
  private var loadCalls = 0
  private var cleared: [String] = []

  init(
    firstCacheGate: ProfileLoadGate? = nil,
    firstCacheSnapshot: MobileMeResponse? = .previewNeedsOnboarding,
    loadGates: [ProfileLoadGate],
    firstResult: Result<MeRepositoryResult, Error> = .success(
      MeRepositoryResult(response: .previewReady, isStale: false)
    ),
    validatesOwner: Bool = false
  ) {
    self.validatesOwner = validatesOwner
    self.firstCacheGate = firstCacheGate
    self.firstCacheSnapshot = firstCacheSnapshot
    self.loadGates = loadGates
    self.firstResult = firstResult
  }

  func cachedSnapshot(for userID: String) async -> MobileMeResponse? {
    cacheCalls += 1
    guard cacheCalls == 1, let firstCacheGate else { return nil }
    _ = await firstCacheGate.wait()
    return firstCacheSnapshot
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
  var cancellations: ProfileTaskCancellationLog? = nil

  func loadMe(for userID: String) async throws -> MeRepositoryResult { try await base.loadMe(for: userID) }
  func loadMe(for userID: String, ifOwnedBy owner: NativeSessionOwnership) async throws -> MeRepositoryResult {
    try await base.loadMe(for: userID, ifOwnedBy: owner)
  }
  func cachedSnapshot(for userID: String) async -> MobileMeResponse? { await base.cachedSnapshot(for: userID) }
  func clearCachedUser(_ userID: String) async {
    // Also observe the legacy path so an unguarded-call regression fails instead of hanging.
    await cancellations?.record(Task.isCancelled)
    _ = await gate.wait()
    await cancellations?.record(Task.isCancelled)
    await base.clearCachedUser(userID)
  }
  func clearCachedUser(_ userID: String, ifOwnedBy ownership: NativeSessionOwnership) async {
    await cancellations?.record(Task.isCancelled)
    _ = await gate.wait()
    await cancellations?.record(Task.isCancelled)
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
  func deactivate(for claim: NativeSessionCleanupClaim) async { await manager.deactivate(for: claim) }
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
  func deactivate(for claim: NativeSessionCleanupClaim) async { await manager.deactivate(for: claim) }
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


private actor ProfileTaskCancellationLog {
  private var values: [Bool] = []
  func record(_ value: Bool) { values.append(value) }
  func recorded() -> [Bool] { values }
}

private actor PausedProfileAPIClient: APIClientProtocol {
  let base: MutableAPIClient
  let gate: ProfileLoadGate
  let cancellations = ProfileTaskCancellationLog()
  private var calls = 0
  private let heldCall: Int
  init(base: MutableAPIClient, gate: ProfileLoadGate, heldCall: Int = 1) {
    self.base = base; self.gate = gate; self.heldCall = heldCall
  }
  func callCount() -> Int { calls }
  func fetchMe() async throws -> MobileMeResponse {
    calls += 1
    if calls == heldCall { _ = await gate.wait() }
    await cancellations.record(Task.isCancelled)
    return try await base.fetchMe()
  }
  func fetchAppleWalletProfilePass() async throws -> Data { try await base.fetchAppleWalletProfilePass() }
  func fetchAudienceHighlights() async throws -> MobileAudienceHighlightsResponse { try await base.fetchAudienceHighlights() }
  func fetchActionLoopInbox() async throws -> MobileActionLoopInboxResponse { try await base.fetchActionLoopInbox() }
  func fetchActionLoopCalendar() async throws -> MobileActionLoopCalendarResponse { try await base.fetchActionLoopCalendar() }
}

extension AppStateTests {
  @Test(arguments: [MobileMeResponse.previewReady, .previewNeedsOnboarding, .previewWaitlistPending])
  func cancelledCallerStillCompletesTheActualOwnedProfileWrite(response: MobileMeResponse) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let caches = CleanupCacheHarness()
      defer { caches.cleanup() }
      await caches.me.store(.previewNeedsOnboarding, for: caches.userID)
      let gate = ProfileLoadGate()
      let repository = MeRepository(apiClient: MutableAPIClient(mode: .success(response)),
        cache: PausedMeCache(base: caches.me, gate: gate, phase: .write))
      let state = AppState(configuration: .mock, launchMode: .live, repository: repository,
        brightnessManager: MockBrightnessController())
      state.didInitializeAuth = true
      let caller = Task { await state.handleSignedInUserChange(caches.userID); await gate.ownerFinished() }
      #expect(await gate.waitUntilEntered())
      #expect(state.dashboardState == .loaded(.previewNeedsOnboarding))
      #expect(!state.isOffline)
      caller.cancel()
      await state.handleSignedInUserChange(caches.userID) // Current duplicates must return while the write is held.
      await gate.complete(true)
      await caller.value
      #expect(caller.isCancelled)
      #expect(state.dashboardState == .loaded(response))
      #expect(state.route == (response.state == .ready ? .ready : response.state == .needsOnboarding ? .needsOnboarding : .waitlistPending))
      #expect(!state.isOffline)
      #expect(await caches.me.load(for: caches.userID)?.response == response)
    }
  }

  @Test(arguments: [false, true])
  func cancelledCallerStillReconcilesRealFallbackAndRecovery(hasCache: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let caches = CleanupCacheHarness()
      defer { caches.cleanup() }
      if hasCache { await caches.me.store(.previewReady, for: caches.userID) }
      let gate = ProfileLoadGate()
      // This holds the first cache read; buffered release also admits the actual fallback read.
      let repository = MeRepository(apiClient: MutableAPIClient(mode: .failure(APIClientError.transportFailed(code: -1009))),
        cache: PausedMeCache(base: caches.me, gate: gate, phase: .fallback))
      let state = AppState(configuration: .mock, launchMode: .live, repository: repository,
        brightnessManager: MockBrightnessController())
      state.didInitializeAuth = true
      let caller = Task { await state.handleSignedInUserChange(caches.userID); await gate.ownerFinished() }
      #expect(await gate.waitUntilEntered())
      caller.cancel()
      await gate.complete(true)
      await caller.value
      #expect(state.route == .ready && state.isOffline)
      #expect(state.dashboardState == (hasCache ? .loaded(.previewReady) : .error("Couldn't load your profile.")))
      #expect(await caches.me.load(for: caches.userID)?.response == (hasCache ? .previewReady : nil))
    }
  }

  @Test(arguments: ["current", "replacement", "nil", "logout"])
  func callerCancellationAndOwnerRetirementHaveDifferentEffectsOnActualProfileFetch(change: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let caches = CleanupCacheHarness()
      defer { caches.cleanup() }
      let gate = ProfileLoadGate()
      let api = PausedProfileAPIClient(base: caches.api, gate: gate)
      let state = AppState(configuration: .mock, launchMode: .live,
        repository: MeRepository(apiClient: api, cache: caches.me), brightnessManager: MockBrightnessController(),
        sessionRevoker: MockSessionRevoker(result: .revoked))
      state.didInitializeAuth = true
      let caller = Task { await state.handleSignedInUserChange(caches.userID); await gate.ownerFinished() }
      #expect(await gate.waitUntilEntered())
      caller.cancel()
      do {
        if change == "replacement" {
          _ = try saveSession()
          await caches.api.updateMode(.success(.previewNeedsOnboarding))
          await state.handleSignedInUserChange(caches.userID)
        } else if change == "nil" { await state.handleSignedInUserChange(nil) }
        else if change == "logout" { await state.signOut() }
      } catch {
        await gate.complete(true); await caller.value
        throw error
      }
      await gate.complete(true)
      await caller.value
      let expected: DashboardLoadState = change == "current" ? .loaded(.previewReady)
        : change == "replacement" ? .loaded(.previewNeedsOnboarding) : .idle
      #expect(state.dashboardState == expected)
      #expect(state.route == (change == "current" ? .ready : change == "replacement" ? .needsOnboarding : .signedOut))
      #expect(await api.cancellations.recorded().last == (change != "current"))
      #expect(await caches.me.load(for: caches.userID)?.response == (change == "current" ? .previewReady
        : change == "replacement" ? .previewNeedsOnboarding : nil))
      if change == "nil" { #expect(NativeSessionTokenStore.load() != nil) }
    }
  }

  @Test func completedProfileTaskReleasesItsSlotForRetry() async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let first = ProfileLoadGate(), retry = ProfileLoadGate()
      let repository = ControlledProfileRepository(loadGates: [first, retry])
      let state = makeState(repository)
      let caller = Task { await state.handleSignedInUserChange("same-user"); await first.ownerFinished() }
      #expect(await first.waitUntilEntered())
      await state.retry()
      #expect(await repository.loadCount() == 1)
      await first.complete(true); await caller.value
      let retried = Task { await state.retry(); await retry.ownerFinished() }
      #expect(await retry.waitUntilEntered())
      await retry.complete(true); await retried.value
      #expect(await repository.loadCount() == 2)
      #expect(state.dashboardState == .loaded(.previewReady))
    }
  }

  @Test(arguments: ["receipt", "retired-receipt", "legacy"], [false, true])
  func profileExpiryFinishesActualCleanupBeforeCancellingItsOwnHandle(kind: String, replaceDuringCleanup: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let original = try saveSession()
      let originalOwnership = try #require(original.ownership)
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      await caches.seed()
      push.defaults.set("old-apns", forKey: PushLifecycleHarness.tokenKey)
      let apiGate = ProfileLoadGate(), cleanupGate = ProfileLoadGate()
      let api = PausedProfileAPIClient(base: caches.api, gate: apiGate)
      let cancellations = ProfileTaskCancellationLog()
      let repository = DelayedCleanupRepository(base: MeRepository(apiClient: api, cache: caches.me),
        gate: cleanupGate, cancellations: cancellations)
      let awaitedPush = ChatReceiptPush(push.manager)
      let revoker = MockSessionRevoker(result: .revoked)
      var oldCurrent = true, captures = 0
      let state = AppState(configuration: .mock, launchMode: .live, repository: repository,
        brightnessManager: MockBrightnessController(), sessionRevoker: revoker, pushNotifications: awaitedPush,
        chatCache: caches.chat, audienceHighlightsCache: caches.audience, actionLoopCache: caches.actionLoop,
        captureProfileLoadCurrentness: { userID in
          if kind == "legacy" { return .unmanaged() }
          if kind == "retired-receipt" && NativeSessionTokenStore.canContinueProfileLoad(ownedBy: originalOwnership) {
            captures += 1
            return ProfileLoadContext(ownership: originalOwnership, canContinue: captures == 1 ? { oldCurrent } : { true })
          }
          return .live(for: userID)
        })
      state.didInitializeAuth = true
      let caller = Task {
        await state.handleSignedInUserChange(caches.userID)
        await apiGate.ownerFinished(); await cleanupGate.ownerFinished()
      }
      #expect(await apiGate.waitUntilEntered())
      #expect(await awaitedPush.waitForActivation())
      caller.cancel()
      do {
        if kind == "retired-receipt" {
          oldCurrent = false
          awaitedPush.activation = ProfileLoadGate()
          await state.handleSignedInUserChange(caches.userID)
          #expect(await awaitedPush.waitForActivation())
        }
        let error: Error = kind == "legacy" ? APIClientError.missingToken
          : NativeSessionRequestError.expired(try ownedProfileExpiryReceipt(original))
        await caches.api.updateMode(.failure(error))
        await apiGate.complete(true)
        let entered = await cleanupGate.waitUntilEntered()
        #expect(entered)
        guard entered else {
          await cleanupGate.complete(true); await caller.value
          return
        }
        #expect(state.route == .signedOut && state.dashboardState == .idle)
        #expect(await api.cancellations.recorded() == (kind == "retired-receipt" ? [false, true] : [false]))
        #expect(await cancellations.recorded() == [false])
        #expect(push.unregisterCount == 1 && push.storedToken == nil)
        if replaceDuringCleanup {
          _ = try saveSession()
          await caches.seed(profile: .previewNeedsOnboarding)
          await caches.api.updateMode(.success(.previewNeedsOnboarding))
          awaitedPush.activation = ProfileLoadGate()
          await state.handleSignedInUserChange(caches.userID)
          #expect(await awaitedPush.waitForActivation())
          push.defaults.set("new-apns", forKey: PushLifecycleHarness.tokenKey)
        }
        let context = NativeSessionTokenStore.captureSessionContext()
        await cleanupGate.complete(true); await caller.value
        #expect(await cancellations.recorded() == [false, false])
        await caches.expectContents(present: replaceDuringCleanup, profile: .previewNeedsOnboarding)
        #expect(state.route == (replaceDuringCleanup ? .needsOnboarding : .signedOut))
        #expect(NativeSessionTokenStore.captureSessionContext() == context)
        #expect(await revoker.calls() == 0)
        #expect(await push.service.requests().deletions.count == (kind == "legacy" ? 1 : 0))
      } catch {
        await apiGate.complete(true); await cleanupGate.complete(true); await caller.value
        throw error
      }
    }
  }

  @Test(arguments: ["success", "error", "cancelled", "retired"])
  func finishedProfileOperationsDoNotRetainTheirAppState(result: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let gate = ProfileLoadGate()
      let response: Result<MeRepositoryResult, Error> = result == "error"
        ? .failure(APIClientError.transportFailed(code: -1009)) : result == "cancelled"
        ? .failure(CancellationError()) : .success(MeRepositoryResult(response: .previewReady, isStale: false))
      let repository = ControlledProfileRepository(loadGates: [gate], firstResult: response)
      var state: AppState? = makeState(repository)
      weak var observed = state
      var caller: Task<Void, Never>? = Task { [state] in
        await state?.handleSignedInUserChange("same-user"); await gate.ownerFinished()
      }
      #expect(await gate.waitUntilEntered())
      if result == "retired" { await state?.handleSignedInUserChange(nil) }
      await gate.complete(true); await caller?.value
      caller = nil
      state = nil
      #expect(observed == nil)
    }
  }
}

extension AppStateTests {
  @Test(arguments: ["cache", "cache-miss", "ready", "onboarding", "waitlist", "transport"])
  func acceptedAuthFencesOldProfileBeforeInstallingCredentials(phase: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let original = try saveSession(), oldGate = ProfileLoadGate(), recoveryGate = ProfileLoadGate()
      let profile: MobileMeResponse = phase == "onboarding" ? .previewNeedsOnboarding
        : phase == "waitlist" ? .previewWaitlistPending : .previewReady
      let response: Result<MeRepositoryResult, Error> = phase == "transport"
        ? .failure(APIClientError.transportFailed(code: -1009))
        : .success(MeRepositoryResult(response: profile, isStale: false))
      let cacheHeld = phase.hasPrefix("cache")
      let repository = ControlledProfileRepository(firstCacheGate: cacheHeld ? oldGate : nil,
        firstCacheSnapshot: phase == "cache-miss" ? nil : .previewNeedsOnboarding,
        loadGates: cacheHeld ? [recoveryGate] : [oldGate, recoveryGate], firstResult: response)
      let state = makeState(repository)
      let caller = Task { await state.handleSignedInUserChange("same-user"); await oldGate.ownerFinished() }
      #expect(await oldGate.waitUntilEntered())
      let attempt = NativeSessionTokenStore.beginAuthAttempt()
      state.acceptAuthAttempt(attempt)
      await state.handleSignedInUserChange(nil); await state.handleSignedInUserChange("same-user")
      await oldGate.complete(true); await caller.value
      #expect(state.route == .launching && !state.isOffline)
      #expect(NativeSessionTokenStore.requestAuthorization() == original)
      #expect(await repository.loadCount() == (cacheHeld ? 0 : 1))
      let resolution = try #require(NativeSessionTokenStore.cancelAuthAttempt(attempt))
      let recovery = state.reconcileAuth(resolution)
      let observer = Task { await recovery?.value; await recoveryGate.ownerFinished() }
      let entered = await recoveryGate.waitUntilEntered()
      #expect(entered, "Pre-I/O cancellation resumes verified A through the canonical profile path")
      await recoveryGate.complete(true); await observer.value
      #expect(state.dashboardState == .loaded(.previewReady))
      #expect(!NativeSessionTokenStore.hasPendingAuth)
    }
  }

  @Test(arguments: [false, true], ["preserved", "unreadable", "fenced", "expired"])
  func persistenceFailureRestoresOnlyPreviouslyAcceptedPresentation(accepted: Bool, fault: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let script = NativeAuthSecurityScript()
      let previous = NativeSessionTokenStore.replaceSecurityOperationsForTesting(script.operations)
      defer { _ = NativeSessionTokenStore.replaceSecurityOperationsForTesting(previous) }
      let authorization = try saveSession(), gate = ProfileLoadGate()
      let repository = ControlledProfileRepository(loadGates: [gate])
      let state = makeState(repository)
      if accepted { await gate.complete(true); await state.handleSignedInUserChange("same-user") }
      let attempt = NativeSessionTokenStore.beginAuthAttempt()
      state.acceptAuthAttempt(attempt)
      if fault == "preserved" || fault == "expired" { script.configure(deleteStatus: errSecAuthFailed, addStatus: errSecAuthFailed) }
      else if fault == "unreadable" { script.configure(reads: [(errSecSuccess, nil)]) }
      else { script.configure(reads: [(errSecSuccess, script.data), (errSecSuccess, Data("mixed".utf8))]) }
      let result = try #require(NativeSessionTokenStore.commit(attempt, session: NativeStoredSession(
        userID: "same-user", token: "new-token", expiresAt: Date().addingTimeInterval(3_600))))
      if fault == "expired" {
        script.configure()
        _ = try ownedProfileExpiryReceipt(authorization)
      }
      var publications = 0
      let work = state.reconcileAuth(result) { publications += 1 }
      await work?.value
      let replay = state.reconcileAuth(result) { publications += 1 }
      await replay?.value
      let restored = accepted && fault != "fenced" && fault != "expired"
      #expect(state.route == (restored ? .ready : .signedOut))
      #expect(state.dashboardState == (restored ? .loaded(.previewReady) : .idle))
      #expect(state.activeSessionOwnership == (restored ? authorization.ownership : nil))
      #expect(await repository.loadCount() == (accepted ? 1 : 0), "Write failure cannot promote a bare old token")
      #expect(publications == 1)
      #expect(await repository.clearedUsers() == (fault == "expired" ? ["same-user"] : []))
    }
  }

  @Test(arguments: [false, true], ["none", "before-cancel", "held-cancel", "held-consumed", "held-failure"])
  func pendingAuthRetainsExactExpiryCleanupAcrossCallerCancellationAndReplay(
    profileOrigin: Bool, resolution: String
  ) async throws {
    try await withNativeAuthSecurityScript { @MainActor script in
      let acceptWhileHeld = resolution.hasPrefix("held")
      let authorization = try saveSession(), apiGate = ProfileLoadGate(), cleanupGate = ProfileLoadGate()
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness(), log = ProfileTaskCancellationLog()
      defer { caches.cleanup(); push.cleanup() }
      await caches.seed()
      let api = PausedProfileAPIClient(base: caches.api, gate: apiGate)
      let repository = FirstHeldAuthCleanupRepository(base: MeRepository(apiClient: api, cache: caches.me),
        gate: cleanupGate, cancellations: log)
      let awaitedPush = ChatReceiptPush(push.manager), revoker = MockSessionRevoker(result: .revoked)
      let state = AppState(configuration: .mock, launchMode: .live, repository: repository,
        brightnessManager: MockBrightnessController(), sessionRevoker: revoker, pushNotifications: awaitedPush,
        chatCache: caches.chat, audienceHighlightsCache: caches.audience, actionLoopCache: caches.actionLoop)
      state.didInitializeAuth = true
      let profile = Task {
        await state.handleSignedInUserChange(caches.userID)
        if profileOrigin { await cleanupGate.ownerFinished() }
      }
      #expect(await apiGate.waitUntilEntered())
      #expect(await awaitedPush.waitForActivation())
      if !profileOrigin { await apiGate.complete(true); await profile.value }
      let receipt: NativeSessionExpiryReceipt
      do { receipt = try ownedProfileExpiryReceipt(authorization) }
      catch { await apiGate.complete(true); await cleanupGate.complete(true); await profile.value; throw error }
      var attempt: NativeAuthAttempt?
      if resolution == "before-cancel" {
        attempt = NativeSessionTokenStore.beginAuthAttempt()
        if let attempt { state.acceptAuthAttempt(attempt) }
      }
      let caller: Task<Void, Never>
      if profileOrigin {
        await caches.api.updateMode(.failure(NativeSessionRequestError.expired(receipt)))
        await apiGate.complete(true); caller = profile
      } else { caller = Task { await state.handleExpiredSession(receipt); await cleanupGate.ownerFinished() } }
      let entered = await cleanupGate.waitUntilEntered()
      #expect(entered)
      caller.cancel()
      if acceptWhileHeld {
        await state.handleSignedInUserChange(caches.userID)
        await state.handleSignedInUserChange(nil)
        await state.handleSignedInUserChange(caches.userID)
        #expect(state.activeUserID == nil && state.dashboardState == .idle)
        attempt = NativeSessionTokenStore.beginAuthAttempt()
        if let attempt { state.acceptAuthAttempt(attempt) }
      }
      let duplicate = Task { await state.handleExpiredSession(receipt) }
      await state.handleSignedInUserChange(nil); await state.handleSignedInUserChange(caches.userID)
      #expect(state.route == (attempt == nil ? .signedOut : .launching) && state.activeUserID == nil)
      var recovery: Task<Void, Never>?
      if let attempt {
        if resolution.hasSuffix("cancel") {
          recovery = NativeSessionTokenStore.cancelAuthAttempt(attempt).flatMap { state.reconcileAuth($0) }
          #expect(state.route == .signedOut)
        } else {
          script.configure(addStatus: errSecDuplicateItem)
          let adopted = ProfileLoadGate()
          var signal: Task<Void, Never>?
          recovery = Task {
            await finalizeMobileAuthAttempt(attempt, exchange: {
              if resolution.hasSuffix("failure") { throw APIClientError.invalidResponse }
              return NativeAuthExchangeResponse(ticket: nil, sessionToken: "b", sessionId: nil,
                userId: caches.userID, returnTo: "/app", expiresInSeconds: 3_600)
            }, reconcile: { result, _ in
              let work = state.reconcileAuth(result)
              signal = Task { await adopted.complete(true) }
              return work
            }, failure: { _, _ in Issue.record("Existing receipt must not claim a second cleanup"); return nil },
            settled: { _ in })
            await adopted.complete(false)
          }
          #expect(await adopted.wait())
          await signal?.value
        }
      }
      await cleanupGate.complete(true); await caller.value; await duplicate.value; await recovery?.value
      #expect(await log.recorded() == [false, false], "Caller cancellation must not abandon retained cleanup")
      await state.handleExpiredSession(receipt)
      await state.handleSignedInUserChange(caches.userID)
      await state.handleSignedInUserChange(nil); await state.handleSignedInUserChange(caches.userID)
      #expect(state.route == .signedOut && state.dashboardState == .idle)
      #expect(await log.recorded().count == 2, "Running and completed receipt replays must not dispatch again")
      await caches.expectContents(present: false)
      #expect(await revoker.calls() == 0)
      #expect(await push.service.requests().deletions.isEmpty)
      #expect(push.unregisterCount == 1 && NativeSessionTokenStore.captureOwnership() == receipt.ownership)
    }
  }
}

private actor FirstHeldAuthCleanupRepository: AppStateRepository {
  let base: MeRepository
  let gate: ProfileLoadGate
  private var removals = 0
  private let cancellations: ProfileTaskCancellationLog?
  init(base: MeRepository, gate: ProfileLoadGate, cancellations: ProfileTaskCancellationLog? = nil) {
    self.base = base; self.gate = gate; self.cancellations = cancellations
  }
  func cachedSnapshot(for userID: String) async -> MobileMeResponse? { await base.cachedSnapshot(for: userID) }
  func loadMe(for userID: String) async throws -> MeRepositoryResult { try await base.loadMe(for: userID) }
  func loadMe(for userID: String, ifOwnedBy owner: NativeSessionOwnership) async throws -> MeRepositoryResult {
    try await base.loadMe(for: userID, ifOwnedBy: owner)
  }
  func clearCachedUser(_ userID: String) async { await base.clearCachedUser(userID) }
  func clearCachedUser(_ userID: String, ifOwnedBy owner: NativeSessionOwnership) async {
    removals += 1
    let isFirst = removals == 1
    await cancellations?.record(Task.isCancelled)
    if isFirst { _ = await gate.wait() }
    await base.clearCachedUser(userID, ifOwnedBy: owner)
    await cancellations?.record(Task.isCancelled)
  }
}

extension AppStateTests {
  @Test(arguments: ["persisted", "preserved", "consumed", "unknown"], ["delete", "add", "copy2"])
  func admittedWriteCancellationReconcilesThroughActualAppState(outcome: String, point: String) async throws {
    try await withNativeAuthSecurityScript { @MainActor script in
      _ = try saveSession()
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness(), gate = ProfileLoadGate()
      defer { caches.cleanup(); push.cleanup() }
      await caches.seed()
      push.defaults.set("apns-a", forKey: PushLifecycleHarness.tokenKey)
      await push.manager.activate()
      let cancellations = ProfileTaskCancellationLog()
      let cache = PausedMeCache(base: caches.me, gate: gate, phase: .write)
      let repository = DelayedCleanupRepository(base: MeRepository(apiClient: caches.api, cache: cache),
        gate: gate, cancellations: cancellations)
      let revoker = MockSessionRevoker(result: .revoked)
      let state = AppState(configuration: .mock, launchMode: .live, repository: repository,
        brightnessManager: MockBrightnessController(), sessionRevoker: revoker, pushNotifications: push.manager,
        chatCache: caches.chat, audienceHighlightsCache: caches.audience, actionLoopCache: caches.actionLoop)
      state.didInitializeAuth = true
      let attempt = NativeSessionTokenStore.beginAuthAttempt()
      state.acceptAuthAttempt(attempt)
      script.configure(deleteStatus: outcome == "preserved" ? errSecInteractionNotAllowed : errSecSuccess,
        addStatus: ["preserved", "consumed"].contains(outcome) ? errSecDuplicateItem : errSecSuccess,
        reads: outcome == "unknown" ? [(errSecSuccess, script.data), (errSecInteractionNotAllowed, nil)] : [],
        cancelAt: point)
      var persistedEvents = 0, errors = 0, deliveries = 0
      let caller = Task {
        await finalizeMobileAuthAttempt(attempt, exchange: {
          NativeAuthExchangeResponse(ticket: nil, sessionToken: "new-token", sessionId: nil,
            userId: caches.userID, returnTo: "/app", expiresInSeconds: 3_600)
        }, reconcile: { result, error in
          state.reconcileAuth(result) {
            deliveries += 1
            if result.outcome == .persisted { persistedEvents += 1 }
            if error != nil { errors += 1 }
          }
        }, failure: { _, _ in Issue.record("Persistence used exchange-failure cleanup"); return nil }, settled: { _ in })
        await gate.ownerFinished()
      }
      let entered = await gate.waitUntilEntered()
      #expect(entered == ["persisted", "consumed"].contains(outcome))
      await gate.complete(true); await caller.value
      #expect(deliveries == 1 && persistedEvents == (outcome == "persisted" ? 1 : 0))
      #expect(errors == (outcome == "persisted" ? 0 : 1))
      #expect(state.route == (outcome == "persisted" ? .ready : .signedOut))
      #expect(state.dashboardState == (outcome == "persisted" ? .loaded(.previewReady) : .idle))
      #expect(await cancellations.recorded() == (outcome == "consumed" ? [false, false] : []))
      await caches.expectContents(present: outcome != "consumed")
      #expect(push.unregisterCount == (outcome == "consumed" ? 1 : 0))
      #expect(await revoker.calls() == 0)
      #expect(await push.service.requests().deletions.isEmpty)
    }
  }

  @Test(arguments: ["consumed-failure", "consumed-logout", "consumed-persisted", "expiry-persisted", "expiry-logout"])
  func replacementOfHeldTerminalKeepsItsCleanupUserAndNewProfile(kind: String) async throws {
    try await withNativeAuthSecurityScript { @MainActor script in
      let original = try saveSession(), terminalGate = ProfileLoadGate(), profileGate = ProfileLoadGate()
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      await caches.seed()
      let api = PausedProfileAPIClient(base: caches.api, gate: profileGate, heldCall: 2)
      let repository = FirstHeldAuthCleanupRepository(base: MeRepository(apiClient: api, cache: caches.me), gate: terminalGate)
      let revoker = MockSessionRevoker(result: .noSession)
      let state = AppState(configuration: .mock, launchMode: .live, repository: repository,
        brightnessManager: MockBrightnessController(), sessionRevoker: revoker, pushNotifications: push.manager,
        chatCache: caches.chat, audienceHighlightsCache: caches.audience, actionLoopCache: caches.actionLoop)
      state.didInitializeAuth = true
      await state.handleSignedInUserChange(caches.userID)
      await push.manager.activate()
      let old: Task<Void, Never>
      if kind.hasPrefix("expiry") {
        let receipt = try ownedProfileExpiryReceipt(original)
        old = Task { await state.handleExpiredSession(receipt); await terminalGate.ownerFinished() }
      } else {
        let attempt = NativeSessionTokenStore.beginAuthAttempt()
        state.acceptAuthAttempt(attempt)
        script.configure(addStatus: errSecDuplicateItem)
        let result = try #require(NativeSessionTokenStore.commit(attempt, session: NativeStoredSession(
          userID: caches.userID, token: "not-saved", expiresAt: .distantFuture)))
        #expect(result.outcome == .consumed)
        let work = state.reconcileAuth(result)
        old = Task { await work?.value; await terminalGate.ownerFinished() }
      }
      #expect(await terminalGate.waitUntilEntered())
      script.configure()
      let next: Task<Void, Never>
      if kind.hasSuffix("logout") { next = Task { _ = await state.signOut() } }
      else {
        let attempt = NativeSessionTokenStore.beginAuthAttempt()
        state.acceptAuthAttempt(attempt)
        next = Task {
          await finalizeMobileAuthAttempt(attempt, exchange: {
            if kind == "consumed-failure" { throw APIClientError.invalidResponse }
            return NativeAuthExchangeResponse(ticket: nil, sessionToken: "same-token", sessionId: nil,
              userId: caches.userID, returnTo: "/app", expiresInSeconds: 3_600)
          }, reconcile: { result, _ in state.reconcileAuth(result) },
          failure: { claim, _ in state.reconcileAuthFailure(claim) { _ in } }, settled: { _ in })
          await profileGate.ownerFinished()
        }
      }
      let installs = kind.hasSuffix("persisted")
      if installs { #expect(await profileGate.waitUntilEntered()) }
      else { await next.value; await caches.expectContents(present: false) }
      let current = NativeSessionTokenStore.captureSessionContext()
      await terminalGate.complete(true); await old.value
      if installs {
        #expect(state.activeSessionOwnership == current.ownership && state.route == .ready)
        await state.handleSignedInUserChange(caches.userID)
        #expect(await api.callCount() == 2, "Old terminal release must not drop B's dedupe owner")
        await profileGate.complete(true); await next.value
        #expect(state.dashboardState == .loaded(.previewReady))
        await caches.expectContents(present: true)
      }
      #expect(NativeSessionTokenStore.captureSessionContext() == current)
      #expect(await revoker.calls() == (installs ? 0 : 1))
    }
  }

  @Test(arguments: ["delete", "post"], [false, true])
  func genuineFailureUsesOwnedPipelineAndCannotFinishOverAcceptedReplacement(pause: String, replace: Bool) async throws {
    try await withNativeAuthSecurityScript { @MainActor _ in
      let original = try saveSession(), gate = ProfileLoadGate()
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      await caches.seed()
      push.defaults.set("apns-a", forKey: PushLifecycleHarness.tokenKey)
      await push.manager.activate()
      if pause == "delete" { await push.service.holdOwnedDelete(gate) }
      let revoker = MockSessionRevoker(result: .failed(statusCode: 503), gate: pause == "post" ? gate : nil)
      let state = cleanupState(caches, push: push, revoker: revoker)
      let attempt = NativeSessionTokenStore.beginAuthAttempt()
      state.acceptAuthAttempt(attempt)
      var rootErrors = 0
      let caller = Task {
        await finalizeMobileAuthAttempt(attempt, exchange: { throw APIClientError.invalidResponse },
          reconcile: { result, _ in state.reconcileAuth(result) }, failure: { claim, _ in
            state.reconcileAuthFailure(claim) { completion in
              NativeSessionTokenStore.performIfCurrent(completion) { rootErrors += 1 }
            }
          }, settled: { _ in Issue.record("Exchange failure published success") })
        await gate.ownerFinished()
      }
      #expect(await gate.waitUntilEntered())
      caller.cancel()
      var replacement: NativeAuthAttempt?
      if replace {
        replacement = NativeSessionTokenStore.beginAuthAttempt()
        if let replacement { state.acceptAuthAttempt(replacement) }
      }
      let context = NativeSessionTokenStore.captureSessionContext()
      await gate.complete(false); await caller.value
      #expect(rootErrors == (replace ? 0 : 1))
      #expect(state.route == (replace ? .launching : .signedOut))
      #expect(push.storedToken == (replace && pause == "delete" ? "apns-a" : nil))
      #expect(push.unregisterCount == (replace && pause == "delete" ? 0 : 1))
      #expect(await push.service.requests().deletions.first?.authorization == original)
      #expect(await revoker.capturedAuthorizations() == (pause == "post" || !replace ? [original] : []))
      await caches.expectContents(present: replace)
      if let replacement {
        #expect(NativeSessionTokenStore.performIfCurrent(replacement, {}))
        #expect(NativeSessionTokenStore.captureSessionContext() == context)
      } else { #expect(NativeSessionTokenStore.load() == nil) }
    }
  }
}

private enum NativeSessionScopeFailure: Error { case sentinel }

extension NativeSessionTokenStoreTestLockTests {
  @Test(NativeSessionStoreScope(), arguments: ["scope-a", "scope-b"])
  func nativeSessionScopeWrapsEachRegisteredCase(token: String) async {
    #expect(NativeSessionTokenStore.load() == nil)
    NativeSessionTokenStore.save(token: token, userID: token,
      expiresAt: Date().addingTimeInterval(3600))
    let owner = NativeSessionTokenStore.captureOwnership()
    await Task.yield()
    #expect(NativeSessionTokenStore.load()?.token == token)
    #expect(NativeSessionTokenStore.captureOwnership() == owner)
  }

  @Test(arguments: ["return", "throw", "cancel"])
  func nativeSessionScopeRetainsItsLeaseUntilTeardown(outcome: String) async throws {
    let test = try #require(Test.current)
    let gate = ProfileLoadGate()
    let contenderEntries = ProfileTaskCancellationLog()
    let owner = Task {
      let result: String
      do {
        try await NativeSessionStoreScope().provideScope(for: test, testCase: nil) {
          #expect(NativeSessionTokenStore.load() == nil)
          NativeSessionTokenStore.save(token: "held-scope", userID: "held-scope",
            expiresAt: Date().addingTimeInterval(3600))
          _ = await gate.wait()
          #expect(NativeSessionTokenStore.load()?.token == "held-scope")
          if outcome == "throw" { throw NativeSessionScopeFailure.sentinel }
          try Task.checkCancellation()
        }
        result = "return"
      } catch NativeSessionScopeFailure.sentinel {
        result = "throw"
      } catch is CancellationError {
        result = "cancel"
      } catch {
        Issue.record(error)
        result = "unexpected"
      }
      await gate.ownerFinished()
      return result
    }
    #expect(await gate.waitUntilEntered())
    if outcome == "cancel" { owner.cancel() }
    let contender = Task {
      await NativeSessionTokenStoreTestLock.shared.withExclusive {
        // A new isolation-helper entry would clear and conceal broken teardown.
        defer { NativeSessionTokenStore.clear() }
        await contenderEntries.record(true)
        #expect(NativeSessionTokenStore.load() == nil)
      }
    }
    // Match the existing lock regressions' bounded opportunity to expose bypasses.
    try? await Task.sleep(for: .milliseconds(50))
    #expect(await contenderEntries.recorded().isEmpty)
    await gate.complete(true)
    #expect(await owner.value == outcome)
    await contender.value
    #expect(await contenderEntries.recorded() == [true])
  }
}

extension AppStateTests {
  @Test(arguments: ["current", "empty", "cancelled", "pending-replacement", "installed-replacement", "expired"])
  func realPreconsumeRejectionPreservesOnlyItsCurrentAcceptedSession(scenario: String) async throws {
    try await withNativeAuthSecurityScript { @MainActor _ in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness(), exchangeGate = ProfileLoadGate()
      defer { caches.cleanup(); push.cleanup() }
      await caches.seed()
      let original = scenario == "empty" ? nil : try saveSession()
      let revoker = MockSessionRevoker(result: .revoked)
      let state = cleanupState(caches, push: push, revoker: revoker)
      if original != nil { await state.handleSignedInUserChange(caches.userID) }
      else { await state.handleSignedInUserChange(nil) }
      await push.manager.activate()
      let unregisterBefore = push.unregisterCount
      let session = NativeExchangeReplyProtocol.session(status: 401,
        body: "{\"exchangePhase\":\"preconsume\",\"reason\":\"wrong_verifier\"}")
      defer { session.invalidateAndCancel() }
      let client = NativeAuthExchangeClient(baseURL: URL(string: "https://jov.ie")!, session: session)
      let attempt = NativeSessionTokenStore.beginAuthAttempt()
      state.acceptAuthAttempt(attempt)
      var errors = 0, deliveries = 0, settled = 0
      let caller = Task {
        await finalizeMobileAuthAttempt(attempt, exchange: {
          do { return try await client.exchange(MobileAuthReturn(code: "code", state: "state", codeVerifier: "verifier")) }
          catch { _ = await exchangeGate.wait(); throw error }
        }, reconcile: { result, error in
          state.reconcileAuth(result) { deliveries += 1; if error != nil { errors += 1 } }
        }, failure: { claim, _ in
          Issue.record("Preconsume rejection attempted destructive failure cleanup")
          return state.reconcileAuthFailure(claim) { _ in }
        }, settled: { result in
          NativeSessionTokenStore.performIfCurrent(result) { settled += 1 }
        })
        await exchangeGate.ownerFinished()
      }
      #expect(await exchangeGate.waitUntilEntered())
      var replacement: NativeAuthAttempt?
      if scenario.hasSuffix("replacement") {
        let next = NativeSessionTokenStore.beginAuthAttempt()
        replacement = next
        state.acceptAuthAttempt(next)
        if scenario == "installed-replacement" {
          await caches.api.updateMode(.success(.previewNeedsOnboarding))
          if let result = NativeSessionTokenStore.commit(next, session: NativeStoredSession(
            userID: caches.userID, token: "b", expiresAt: .distantFuture)) {
            await state.reconcileAuth(result)?.value
          } else { Issue.record("Replacement did not install") }
        }
      } else if scenario == "expired", let original {
        do { await state.handleExpiredSession(try ownedProfileExpiryReceipt(original)) }
        catch {
          await exchangeGate.complete(true)
          await caller.value
          throw error
        }
      } else if scenario == "cancelled" { caller.cancel() }
      let context = NativeSessionTokenStore.captureSessionContext()
      await exchangeGate.complete(true); await caller.value
      #expect(NativeExchangeReplyProtocol.requests.count == 1)
      #expect(deliveries == (replacement == nil ? 1 : 0))
      #expect(errors == (replacement == nil && scenario != "cancelled" ? 1 : 0))
      #expect(settled == (replacement == nil && scenario != "cancelled" ? 1 : 0))
      #expect(NativeSessionTokenStore.captureSessionContext() == context)
      #expect(await revoker.calls() == 0)
      #expect(await push.service.requests().deletions.isEmpty)
      #expect(push.unregisterCount == unregisterBefore + (scenario == "expired" ? 1 : 0))
      await caches.expectContents(present: scenario != "expired",
        profile: scenario == "installed-replacement" ? .previewNeedsOnboarding : .previewReady)
      let route: AppRouter = scenario == "pending-replacement" ? .launching
        : scenario == "installed-replacement" ? .needsOnboarding
        : ["empty", "expired"].contains(scenario) ? .signedOut : .ready
      #expect(state.route == route)
      if scenario == "pending-replacement", let replacement {
        #expect(NativeSessionTokenStore.performIfCurrent(replacement, {}))
      } else { #expect(!NativeSessionTokenStore.hasPendingAuth) }
    }
  }

  @Test func preconsumeRecoveryProfileOutlivesItsFinalizerCaller() async throws {
    try await withNativeAuthSecurityScript { @MainActor _ in
      let original = try saveSession(), cacheGate = ProfileLoadGate()
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      await caches.seed()
      let repository = MeRepository(apiClient: caches.api,
        cache: PausedMeCache(base: caches.me, gate: cacheGate, phase: .write))
      let revoker = MockSessionRevoker(result: .revoked)
      let state = AppState(configuration: .mock, launchMode: .live, repository: repository,
        brightnessManager: MockBrightnessController(), sessionRevoker: revoker, pushNotifications: push.manager,
        chatCache: caches.chat, audienceHighlightsCache: caches.audience, actionLoopCache: caches.actionLoop)
      state.didInitializeAuth = true
      let session = NativeExchangeReplyProtocol.session(status: 401,
        body: "{\"exchangePhase\":\"preconsume\",\"reason\":\"expired\"}")
      defer { session.invalidateAndCancel() }
      let client = NativeAuthExchangeClient(baseURL: URL(string: "https://jov.ie")!, session: session)
      let attempt = NativeSessionTokenStore.beginAuthAttempt()
      state.acceptAuthAttempt(attempt)
      var deliveries = 0
      let caller = Task {
        await finalizeMobileAuthAttempt(attempt, exchange: {
          try await client.exchange(MobileAuthReturn(code: "code", state: "state", codeVerifier: "verifier"))
        }, reconcile: { result, _ in state.reconcileAuth(result) { deliveries += 1 } },
          failure: { _, _ in Issue.record("Preconsume recovery claimed cleanup"); return nil }, settled: { _ in })
        await cacheGate.ownerFinished()
      }
      #expect(await cacheGate.waitUntilEntered())
      caller.cancel()
      await cacheGate.complete(true); await caller.value
      #expect(deliveries == 1 && NativeExchangeReplyProtocol.requests.count == 1)
      #expect(state.dashboardState == .loaded(.previewReady) && state.route == .ready)
      #expect(NativeSessionTokenStore.requestAuthorization() == original)
      #expect(!NativeSessionTokenStore.hasPendingAuth)
      #expect(await revoker.calls() == 0)
      #expect(push.unregisterCount == 0)
      #expect(await push.service.requests().deletions.isEmpty)
      await caches.expectContents(present: true)
    }
  }
}


private struct DelayedProfileCompletionResult: ProfileCompleting {
  let gate: ProfileLoadGate
  var authorizationToExpire: NativeRequestAuthorization?
  func completeProfile(displayName: String, username: String, for userID: String,
                       ifOwnedBy owner: NativeSessionOwnership) async throws {
    if let authorizationToExpire {
      do {
        _ = try NativeSessionTokenStore.resolveUnauthorized(authorizedBy: authorizationToExpire, allowRetry: false)
        Issue.record("Expected current-owner expiry")
      } catch {
        _ = await gate.wait()
        throw error
      }
    } else { _ = await gate.wait() }
  }
}

extension AppStateTests {
  @MainActor
  private func completionState(_ caches: CleanupCacheHarness, push: PushLifecycleHarness,
                               revoker: MockSessionRevoker, client: APIClient) -> AppState {
    let state = AppState(configuration: .mock, launchMode: .live,
      repository: MeRepository(apiClient: client, cache: caches.me),
      brightnessManager: MockBrightnessController(), sessionRevoker: revoker,
      pushNotifications: push.manager, chatCache: caches.chat,
      audienceHighlightsCache: caches.audience, actionLoopCache: caches.actionLoop)
    state.didInitializeAuth = true
    return state
  }

  @Test(arguments: ["ready", "waitlist", "onboarding", "decode", "transport"])
  func profileCompletionRequiresItsFreshAcceptedProfile(outcome: String) async throws {
    try await withNativeAuthSecurityScript { @MainActor _ in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      let original = try saveSession()
      await caches.seed(profile: .previewNeedsOnboarding)
      let response: MobileMeResponse = outcome == "ready" ? .previewReady
        : outcome == "waitlist" ? .previewWaitlistPending : .previewNeedsOnboarding
      let script = ProfileCompletionHTTP([
        .init(body: try JSONEncoder().encode(MobileMeResponse.previewNeedsOnboarding)),
        .init(),
        .init(body: outcome == "decode" ? Data("{".utf8) : try JSONEncoder().encode(response),
          failure: outcome == "transport" ? .networkConnectionLost : nil),
      ])
      let session = ProfileCompletionURLProtocol.session(script)
      defer { session.invalidateAndCancel() }
      let client = APIClient(baseURL: URL(string: "https://jov.ie")!, session: session,
        tokenProvider: NativeSessionTokenProvider())
      let revoker = MockSessionRevoker(result: .revoked)
      let state = completionState(caches, push: push, revoker: revoker, client: client)
      await state.handleSignedInUserChange(caches.userID)
      let message = await state.completeProfile(displayName: "A", username: "a", for: caches.userID,
        ifOwnedBy: original.ownership!, using: client)
      await ProfileCompletionURLProtocol.drain()
      let accepted = outcome == "ready" || outcome == "waitlist"
      #expect((message == nil) == accepted)
      #expect(state.route == (outcome == "ready" ? .ready : outcome == "waitlist" ? .waitlistPending : .needsOnboarding))
      #expect(state.dashboardState == .loaded(response))
      #expect(state.isOffline == (outcome == "decode" || outcome == "transport"))
      #expect(state.activeSessionOwnership == original.ownership)
      #expect(NativeSessionTokenStore.requestAuthorization() == original)
      await caches.expectContents(present: true, profile: response)
      let requests = await script.requests
      #expect(requests.map(\.httpMethod) == ["GET", "POST", "GET"])
      #expect(requests.filter { $0.url?.path == "/api/mobile/v1/me" }.count == 2)
      #expect(await revoker.calls() == 0)
    }
  }

  @Test(arguments: ["same-user", "different-user", "pending"], [200, 401, 409])
  func oldProfileCompletionCannotPublishOrReloadAReplacement(change: String, status: Int) async throws {
    try await withNativeAuthSecurityScript { @MainActor _ in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness(), gate = ProfileLoadGate()
      defer { caches.cleanup(); push.cleanup() }
      let original = try saveSession()
      await caches.seed(profile: .previewNeedsOnboarding)
      let script = ProfileCompletionHTTP([
        .init(body: try JSONEncoder().encode(MobileMeResponse.previewNeedsOnboarding)),
        .init(status: status, body: Data((status == 409 ? #"{"error":"Old form error"}"# : #"{"profileId":"p"}"#).utf8),
          headers: ["set-auth-token": "late-a"], gate: gate),
        .init(body: try JSONEncoder().encode(MobileMeResponse.previewWaitlistPending)),
      ])
      let session = ProfileCompletionURLProtocol.session(script)
      defer { session.invalidateAndCancel() }
      let client = APIClient(baseURL: URL(string: "https://jov.ie")!, session: session,
        tokenProvider: NativeSessionTokenProvider())
      let revoker = MockSessionRevoker(result: .revoked)
      let state = completionState(caches, push: push, revoker: revoker, client: client)
      await state.handleSignedInUserChange(caches.userID)
      let caller = Task {
        let result = await state.completeProfile(displayName: "A", username: "a", for: caches.userID,
          ifOwnedBy: original.ownership!, using: client)
        await gate.ownerFinished()
        return result
      }
      #expect(await gate.waitUntilEntered())
      var pending: NativeAuthAttempt?
      let nextUser = change == "different-user" ? "other-user" : caches.userID
      if change == "pending" {
        let attempt = NativeSessionTokenStore.beginAuthAttempt()
        pending = attempt
        state.acceptAuthAttempt(attempt)
      } else {
        NativeSessionTokenStore.save(token: "b", userID: nextUser, expiresAt: .distantFuture)
        await state.handleSignedInUserChange(nextUser)
      }
      let context = NativeSessionTokenStore.captureSessionContext()
      let route = state.route, dashboard = state.dashboardState, owner = state.activeSessionOwnership
      await gate.complete(true)
      let message = await caller.value
      await ProfileCompletionURLProtocol.drain()
      #expect(message == nil && state.route == route)
      // Pending auth keeps its route while the exact receipt cleans A's profile.
      if change == "pending", status == 401 {
        #expect(NativeSessionTokenStore.load() == nil)
        #expect(state.activeUserID == nil && state.activeSessionOwnership == nil)
        #expect(state.dashboardState == .idle)
        await caches.expectContents(present: false)
      } else {
        if change == "pending", status == 200 {
          // Pending intent freezes presentation, while A may still rotate its own bearer.
          let refreshed = NativeSessionTokenStore.captureSessionContext()
          #expect(refreshed.ownership == context.ownership)
          #expect(NativeSessionTokenStore.load()?.userID == caches.userID)
          #expect(refreshed.authorization?.bearerToken == "late-a")
          #expect(refreshed.authorization != context.authorization)
        } else {
          #expect(NativeSessionTokenStore.captureSessionContext() == context)
        }
        #expect(state.activeSessionOwnership == owner && state.dashboardState == dashboard)
      }
      if let pending { #expect(NativeSessionTokenStore.performIfCurrent(pending, {})) }
      else {
        #expect(await caches.me.load(for: nextUser)?.response == .previewWaitlistPending)
        #expect(await MeCache(defaults: caches.defaults).load(for: nextUser)?.response == .previewWaitlistPending)
      }
      #expect(await script.requests.count == (change == "pending" ? 2 : 3))
      #expect(await revoker.calls() == 0)
    }
  }

  @Test func postCompletionReloadRetiresOldLoadAndOutlivesCaller() async throws {
    try await withNativeAuthSecurityScript { @MainActor _ in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      let original = try saveSession(), oldGate = ProfileLoadGate(), newGate = ProfileLoadGate()
      await caches.seed(profile: .previewNeedsOnboarding)
      let script = ProfileCompletionHTTP([
        .init(body: try JSONEncoder().encode(MobileMeResponse.previewNeedsOnboarding), gate: oldGate),
        .init(),
        .init(body: try JSONEncoder().encode(MobileMeResponse.previewReady), gate: newGate),
      ])
      let session = ProfileCompletionURLProtocol.session(script)
      defer { session.invalidateAndCancel() }
      let client = APIClient(baseURL: URL(string: "https://jov.ie")!, session: session,
        tokenProvider: NativeSessionTokenProvider())
      let state = completionState(caches, push: push, revoker: MockSessionRevoker(result: .revoked), client: client)
      let initial = Task { await state.handleSignedInUserChange(caches.userID); await oldGate.ownerFinished() }
      #expect(await oldGate.waitUntilEntered())
      #expect(state.route == .needsOnboarding)
      let caller = Task {
        let result = await state.completeProfile(displayName: "A", username: "a", for: caches.userID,
          ifOwnedBy: original.ownership!, using: client)
        await newGate.ownerFinished()
        return result
      }
      #expect(await newGate.waitUntilEntered())
      caller.cancel()
      await oldGate.complete(true); await newGate.complete(true)
      await initial.value
      let message = await caller.value
      await ProfileCompletionURLProtocol.drain()
      #expect(message == nil && state.route == .ready && state.dashboardState == .loaded(.previewReady))
      #expect(state.activeSessionOwnership == original.ownership)
      #expect(NativeSessionTokenStore.requestAuthorization() == original)
      await caches.expectContents(present: true)
      #expect(await script.requests.map(\.httpMethod) == ["GET", "POST", "GET"])
    }
  }

  @Test(arguments: [false, true])
  func canceledCompletionStillDeliversAnAlreadyIssuedExpiry(expire: Bool) async throws {
    try await withNativeAuthSecurityScript { @MainActor _ in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness(), gate = ProfileLoadGate()
      defer { caches.cleanup(); push.cleanup() }
      let original = try saveSession()
      await caches.seed(profile: .previewNeedsOnboarding)
      await caches.api.updateMode(.success(.previewNeedsOnboarding))
      let revoker = MockSessionRevoker(result: .revoked)
      let state = cleanupState(caches, push: push, revoker: revoker)
      await state.handleSignedInUserChange(caches.userID)
      await push.manager.activate()
      let unregisterBefore = push.unregisterCount
      let caller = Task {
        let result = await state.completeProfile(displayName: "A", username: "a", for: caches.userID,
          ifOwnedBy: original.ownership!, using: DelayedProfileCompletionResult(gate: gate,
            authorizationToExpire: expire ? original : nil))
        await gate.ownerFinished()
        return result
      }
      #expect(await gate.waitUntilEntered())
      caller.cancel()
      await gate.complete(true)
      let message = await caller.value
      #expect(message == nil)
      #expect(state.route == (expire ? .signedOut : .needsOnboarding))
      #expect(NativeSessionTokenStore.requestAuthorization() == (expire ? nil : original))
      #expect(push.unregisterCount == unregisterBefore + (expire ? 1 : 0))
      #expect(await push.service.requests().deletions.isEmpty)
      #expect(await revoker.calls() == 0)
      await caches.expectContents(present: !expire, profile: .previewNeedsOnboarding)
    }
  }

  @Test(arguments: [401, 409])
  func currentProfileCompletionDeliversOnlyItsCurrentError(status: Int) async throws {
    try await withNativeAuthSecurityScript { @MainActor _ in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness()
      defer { caches.cleanup(); push.cleanup() }
      let original = try saveSession()
      await caches.seed(profile: .previewNeedsOnboarding)
      let script = ProfileCompletionHTTP([
        .init(body: try JSONEncoder().encode(MobileMeResponse.previewNeedsOnboarding)),
        .init(status: status, body: Data(#"{"error":"Username is taken"}"#.utf8)),
      ])
      let session = ProfileCompletionURLProtocol.session(script)
      defer { session.invalidateAndCancel() }
      let client = APIClient(baseURL: URL(string: "https://jov.ie")!, session: session,
        tokenProvider: NativeSessionTokenProvider())
      let revoker = MockSessionRevoker(result: .revoked)
      let state = completionState(caches, push: push, revoker: revoker, client: client)
      await state.handleSignedInUserChange(caches.userID)
      await push.manager.activate()
      let unregisterBefore = push.unregisterCount
      let message = await state.completeProfile(displayName: "A", username: "a", for: caches.userID,
        ifOwnedBy: original.ownership!, using: client)
      await ProfileCompletionURLProtocol.drain()
      #expect(message == (status == 401 ? nil : "Username is taken"))
      #expect(state.route == (status == 401 ? .signedOut : .needsOnboarding))
      #expect(NativeSessionTokenStore.requestAuthorization() == (status == 401 ? nil : original))
      #expect(push.unregisterCount == unregisterBefore + (status == 401 ? 1 : 0))
      #expect(await push.service.requests().deletions.isEmpty)
      #expect(await revoker.calls() == 0)
      await caches.expectContents(present: status != 401, profile: .previewNeedsOnboarding)
      #expect(await script.requests.map(\.httpMethod) == ["GET", "POST"])
    }
  }

  @Test(arguments: [false, true])
  func postCompletionProfileCannotOutliveItsSession(expire: Bool) async throws {
    try await withNativeAuthSecurityScript { @MainActor _ in
      let caches = CleanupCacheHarness(), push = PushLifecycleHarness(), gate = ProfileLoadGate()
      defer { caches.cleanup(); push.cleanup() }
      let original = try saveSession()
      await caches.seed(profile: .previewNeedsOnboarding)
      let script = ProfileCompletionHTTP([
        .init(body: try JSONEncoder().encode(MobileMeResponse.previewNeedsOnboarding)),
        .init(),
        .init(body: try JSONEncoder().encode(MobileMeResponse.previewReady), gate: gate),
        .init(body: try JSONEncoder().encode(MobileMeResponse.previewWaitlistPending)),
      ])
      let session = ProfileCompletionURLProtocol.session(script)
      defer { session.invalidateAndCancel() }
      let client = APIClient(baseURL: URL(string: "https://jov.ie")!, session: session,
        tokenProvider: NativeSessionTokenProvider())
      let revoker = MockSessionRevoker(result: .revoked)
      let state = completionState(caches, push: push, revoker: revoker, client: client)
      await state.handleSignedInUserChange(caches.userID)
      let caller = Task {
        let result = await state.completeProfile(displayName: "A", username: "a", for: caches.userID,
          ifOwnedBy: original.ownership!, using: client)
        await gate.ownerFinished()
        return result
      }
      #expect(await gate.waitUntilEntered())
      if expire {
        do { await state.handleExpiredSession(try ownedProfileExpiryReceipt(original)) }
        catch {
          await gate.complete(true); _ = await caller.value
          await ProfileCompletionURLProtocol.drain()
          throw error
        }
      } else {
        NativeSessionTokenStore.save(token: "b", userID: caches.userID, expiresAt: .distantFuture)
        await state.handleSignedInUserChange(caches.userID)
      }
      let preserved = NativeSessionTokenStore.captureSessionContext()
      await gate.complete(true)
      let message = await caller.value
      await ProfileCompletionURLProtocol.drain()
      #expect(message == nil && NativeSessionTokenStore.captureSessionContext() == preserved)
      #expect(state.route == (expire ? .signedOut : .waitlistPending))
      #expect(state.dashboardState == (expire ? .idle : .loaded(.previewWaitlistPending)))
      await caches.expectContents(present: !expire, profile: .previewWaitlistPending)
      #expect(await script.requests.count == (expire ? 3 : 4))
      #expect(await revoker.calls() == 0)
    }
  }
}


// Record the actual callback/deinit tasks so a rejected callback has a joined end.
private final class BrowserOwnerTaskLog: @unchecked Sendable {
  private let lock = NSLock()
  private var tasks: [Task<Void, Never>] = []
  func dispatch(_ operation: @escaping @MainActor @Sendable () -> Void) -> Task<Void, Never> {
    let task = Task { @MainActor in operation() }
    lock.lock(); tasks.append(task); lock.unlock()
    return task
  }
  private func snapshot() -> [Task<Void, Never>] {
    lock.lock(); defer { lock.unlock() }; return tasks
  }
  func join() async {
    var joined = 0
    while true {
      let batch = snapshot()
      guard joined < batch.count else { return }
      for task in batch.dropFirst(joined) { await task.value }
      joined = batch.count
    }
  }
}

@MainActor
private final class BrowserOwnerHarness {
  let suite = "BrowserOwnerTests.\(UUID().uuidString)"
  let defaults: UserDefaults
  let pending: MobileAuthPendingStore
  let dispatched = BrowserOwnerTaskLog()
  let windows = [ProfileLoadGate(), ProfileLoadGate(), ProfileLoadGate()]
  let delay = ProfileLoadGate(), exchangeGate = ProfileLoadGate()
  var callbacks: [@Sendable (URL?, Error?) -> Void] = []
  var starts: [Int] = [], cancels: [Int] = [], exchanges: [MobileAuthReturn] = []
  var observations: [Task<Void, Never>] = []
  var nextWindow = 0, verifierCount = 0, completions = 0
  var hasAnchor = true, startsSuccessfully = true, randomFails = false
  var sessionToken = "native-A"
  var nonce = String(repeating: "A", count: 43), nonceCount = 0
  var nonceFails = false
  var exchangeFailure: Error?
  func seed(_ verifier: String) {
    pending.save(codeVerifier: verifier, nativeAttempt: nonce, baseURL: Configuration.mock.webBaseURL)
  }
  init() { defaults = UserDefaults(suiteName: suite)!; pending = MobileAuthPendingStore(defaults: defaults) }
  func owner(_ state: AppState) -> MobileAuthCoordinator {
    let log = dispatched
    let browser = MobileAuthBrowserDependencies(dispatch: { log.dispatch($0) }, makeNativeAttempt: {
      if self.nonceFails { throw MobileAuthCoordinatorError.randomGenerationFailed(errSecNotAvailable) }
      self.nonceCount += 1
      self.nonce = String(repeating: "A", count: 42) + String(self.nonceCount)
      return self.nonce
    }, makeVerifier: {
      if self.randomFails { throw MobileAuthCoordinatorError.randomGenerationFailed(errSecNotAvailable) }
      self.verifierCount += 1; return "verifier-\(self.verifierCount)"
    }, waitForPresentation: {
      let index = self.nextWindow; self.nextWindow += 1
      guard index < self.windows.count else { Issue.record("Unexpected browser presentation"); return }
      _ = await self.windows[index].wait()
    }, hasPresentationAnchor: { self.hasAnchor }, makeSession: { _, _, callback in
      let index = self.callbacks.count; self.callbacks.append(callback)
      return MobileAuthBrowserSession(start: { self.starts.append(index); return self.startsSuccessfully },
        cancel: { self.cancels.append(index) })
    })
    return MobileAuthCoordinator(appState: state, pendingStore: pending, browser: browser,
      callbackDelay: { _ = await self.delay.wait() }, exchange: {
        self.exchanges.append($0); _ = await self.exchangeGate.wait()
        if let failure = self.exchangeFailure { throw failure }
        return NativeAuthExchangeResponse(ticket: nil, sessionToken: self.sessionToken, sessionId: "session-A",
          userId: "same-user", returnTo: "/app", expiresInSeconds: 3600)
      })
  }
  func entered(_ gate: ProfileLoadGate, tasks: [Task<Void, Never>]) async -> Bool {
    observations.append(Task { for task in tasks { await task.value }; await gate.ownerFinished() })
    let entered = await gate.waitUntilEntered(); #expect(entered); return entered
  }
  func open(_ owner: MobileAuthCoordinator, window: Int) async {
    let tasks = owner.workTasks
    await windows[window].complete(true)
    for task in tasks { await task.value }
  }
  func callback(_ index: Int, url: URL? = nil, error: Error? = nil) async {
    guard callbacks.indices.contains(index) else { Issue.record("Missing browser callback"); return }
    callbacks[index](url, error); await dispatched.join()
  }
  func finish(_ owner: inout MobileAuthCoordinator?, tasks: [Task<Void, Never>] = []) async {
    let owned = owner?.workTasks ?? []
    owner?.cancelCurrentAuth()
    owner = nil
    for gate in windows + [delay, exchangeGate] { await gate.complete(true) }
    for task in tasks + owned + observations { await task.value }
    await dispatched.join()
    defaults.removePersistentDomain(forName: suite)
  }
  var callbackURL: URL { URL(string: "ie.jov.jovie://auth/complete?code=code-A&state=\(suite)&native_attempt=\(nonce)")! }
  var retryError: Error {
    NSError(domain: ASWebAuthenticationSessionErrorDomain,
      code: ASWebAuthenticationSessionError.Code.presentationContextInvalid.rawValue)
  }
}

extension AppStateTests {
  @Test(arguments: ["initial-window", "retry-window", "old-success", "old-error", "old-retry-session"])
  func oldBrowserWorkCannotMutateTheCurrentProducer(phase: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let state = makeState(ControlledProfileRepository(loadGates: [])); state.route = .signedOut
      let harness = BrowserOwnerHarness()
      var owner: MobileAuthCoordinator? = harness.owner(state)
      owner!.startBrowserAuth(isMock: false)
      var oldTasks = owner!.workTasks
      if phase == "initial-window" {
        _ = await harness.entered(harness.windows[0], tasks: oldTasks)
      } else {
        await harness.open(owner!, window: 0)
        if phase == "retry-window" || phase == "old-retry-session" {
          await harness.callback(0, error: harness.retryError)
          oldTasks = owner!.workTasks
          if phase == "retry-window" { _ = await harness.entered(harness.windows[1], tasks: oldTasks) }
          else { await harness.open(owner!, window: 1) }
        }
      }
      let sameProducer = phase == "old-retry-session"
      if !sameProducer {
        owner!.startSignIn(baseURL: state.configuration.webBaseURL) { _ in harness.completions += 1 }
        await harness.open(owner!, window: phase == "retry-window" ? 2 : 1)
      }
      let pending = harness.pending.snapshot(), route = state.route
      let started = harness.starts, cancelled = harness.cancels, opening = owner!.isOpening
      if phase == "initial-window" || phase == "retry-window" {
        await harness.windows[phase == "initial-window" ? 0 : 1].complete(true)
        for task in oldTasks { await task.value }
      } else {
        await harness.callback(0, url: phase == "old-error" ? nil : harness.callbackURL,
          error: phase == "old-error" ? CancellationError() : nil)
      }
      #expect(harness.pending.isCurrent(pending) && harness.pending.hasCodeVerifier())
      #expect(harness.starts == started && harness.cancels == cancelled && harness.completions == 0)
      #expect(harness.exchanges.isEmpty && owner!.authErrorMessage == nil && owner!.isOpening == opening)
      #expect(state.route == route && !NativeSessionTokenStore.hasPendingAuth)
      await harness.finish(&owner, tasks: oldTasks)
    }
  }

  @Test(arguments: ["cancel", "provider", "missing-url", "invalid-callback", "no-anchor", "start-false", "RNG", "nonce-RNG"])
  func currentBrowserTerminalFailurePreservesItsExpectedCopy(reason: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let state = makeState(ControlledProfileRepository(loadGates: [])); state.route = .signedOut
      let harness = BrowserOwnerHarness()
      var owner: MobileAuthCoordinator? = harness.owner(state)
      harness.hasAnchor = reason != "no-anchor"; harness.startsSuccessfully = reason != "start-false"
      harness.randomFails = reason == "RNG"
      harness.nonceFails = reason == "nonce-RNG"
      let inputFails = harness.randomFails || harness.nonceFails
      if inputFails { harness.pending.save(codeVerifier: "preserved") }
      let before = harness.pending.snapshot()
      owner!.startBrowserAuth(isMock: false)
      if !inputFails { await harness.open(owner!, window: 0) }
      if ["cancel", "provider", "missing-url", "invalid-callback"].contains(reason) {
        let url = reason == "provider" ? URL(string: "ie.jov.jovie://auth/complete?error=access_denied&native_attempt=\(harness.nonce)")
          : reason == "invalid-callback" ? URL(string: "https://unrelated.example/invalid") : nil
        await harness.callback(0, url: url, error: reason == "cancel" ? CancellationError() : nil)
      }
      #expect(!owner!.isOpening && harness.exchanges.isEmpty && !NativeSessionTokenStore.hasPendingAuth)
      #expect(owner!.authErrorMessage == (["cancel", "provider"].contains(reason) ? MobileAuthCopy.cancellation : MobileAuthCopy.failure))
      if inputFails { #expect(harness.pending.isCurrent(before)) }
      else { #expect(harness.pending.hasCodeVerifier() == (reason == "invalid-callback")) }
      await harness.finish(&owner)
    }
  }
}


extension AppStateTests {
  @Test(arguments: ["browser-open", "presentation-await", "retry-await"], [false, true])
  func releasingBrowserOwnerCancelsOnlyItsExactSession(phase: String, replace: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let state = makeState(ControlledProfileRepository(loadGates: [])); state.route = .signedOut
      let harness = BrowserOwnerHarness()
      var owner: MobileAuthCoordinator? = harness.owner(state)
      weak var released = owner
      owner?.startBrowserAuth(isMock: false)
      if phase != "presentation-await", let current = owner { await harness.open(current, window: 0) }
      if phase == "retry-await" { await harness.callback(0, error: harness.retryError) }
      let tasks = owner?.workTasks ?? []
      if phase != "browser-open" {
        _ = await harness.entered(harness.windows[phase == "retry-await" ? 1 : 0], tasks: tasks)
      }
      owner = nil
      #expect(released == nil)
      if replace { harness.pending.save(codeVerifier: "replacement-B") }
      let replacement = harness.pending.snapshot()
      await harness.dispatched.join()
      #expect(harness.cancels == (phase == "browser-open" ? [0] : []))
      #expect(harness.pending.isCurrent(replacement) == replace)
      #expect(harness.pending.hasCodeVerifier() == replace)
      await harness.finish(&owner, tasks: tasks)
      #expect(harness.exchanges.isEmpty && !NativeSessionTokenStore.hasPendingAuth)
    }
  }

  @Test(arguments: [false, true])
  func delayedURLWithoutVerifierRespectsItsCapturedPendingProducer(replace: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let state = makeState(ControlledProfileRepository(loadGates: [])); state.route = .signedOut
      let harness = BrowserOwnerHarness()
      var owner: MobileAuthCoordinator? = harness.owner(state)
      owner!.handleAuthReturn(harness.callbackURL)
      let retry = owner!.workTasks
      _ = await harness.entered(harness.delay, tasks: retry)
      if replace { owner!.startBrowserAuth(isMock: false) }
      let pending = harness.pending.snapshot()
      await harness.delay.complete(true)
      for task in retry { await task.value }
      #expect(harness.pending.isCurrent(pending) && harness.pending.hasCodeVerifier() == replace)
      #expect(harness.exchanges.isEmpty && owner!.isOpening == replace)
      #expect(owner!.authErrorMessage == (replace ? nil : MobileAuthCopy.failure))
      #expect(!NativeSessionTokenStore.hasPendingAuth)
      if replace {
        await harness.open(owner!, window: 0)
        #expect(harness.starts == [0])
      } else { #expect(harness.starts.isEmpty) }
      await harness.finish(&owner)
    }
  }
}


extension AppStateTests {
  @Test(arguments: ["cold-inbox", "manual", "browser-duplicates", "replacement-view"])
  func retainedOwnerCompletesRealIngressOnce(ingress: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let profile = ProfileLoadGate(); await profile.complete(true)
      let repository = ControlledProfileRepository(loadGates: [profile])
      let state = makeState(repository); state.route = .signedOut
      let harness = BrowserOwnerHarness()
      var owner: MobileAuthCoordinator? = harness.owner(state)
      if ingress == "browser-duplicates" {
        owner!.startBrowserAuth(isMock: false); await harness.open(owner!, window: 0)
        await harness.callback(0, url: harness.callbackURL)
      } else {
        harness.seed("manual-verifier")
        if ingress == "cold-inbox" {
          MobileAuthCallbackURLInbox.shared.enqueue(harness.callbackURL)
          owner!.drainPendingAuthCallbackURLs()
        } else { owner!.handleAuthReturn(harness.callbackURL) }
      }
      let tasks = owner!.workTasks
      _ = await harness.entered(harness.exchangeGate, tasks: tasks)
      #expect(NativeSessionTokenStore.hasPendingAuth && state.route == .launching)
      if ingress == "browser-duplicates" {
        await harness.callback(0, url: harness.callbackURL)
        owner!.handleAuthReturn(harness.callbackURL)
        MobileAuthCallbackURLInbox.shared.enqueue(harness.callbackURL)
        owner!.drainPendingAuthCallbackURLs()
      }
      if ingress == "replacement-view" {
        // Compiled wiring/identity only: this does not claim hosted onDisappear execution.
        var first: LiveRootContainer? = LiveRootContainer(appState: state, authCoordinator: owner!)
        let replacement = LiveRootContainer(appState: state, authCoordinator: owner!)
        let screen = AuthScreen(isMock: false, isSignInUnavailable: false,
          errorMessage: owner!.authErrorMessage, authCoordinator: owner!)
        #expect(first?.authCoordinator === replacement.authCoordinator)
        #expect(screen.authCoordinator === owner)
        first = nil
      }
      await harness.exchangeGate.complete(true)
      for task in tasks { await task.value }
      #expect(harness.exchanges.count == 1 && !harness.pending.hasCodeVerifier())
      #expect(NativeSessionTokenStore.requestAuthorization()?.bearerToken == "native-A")
      #expect(state.route == .ready && state.dashboardState == .loaded(.previewReady))
      #expect(await repository.loadCount() == 1)
      await harness.finish(&owner, tasks: tasks)
    }
  }

#if DEBUG
  @Test(arguments: [false, true])
  func launchInputRunsOnceAcrossRebuildAndNewPendingProducer(replace: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let profile = ProfileLoadGate(); await profile.complete(true)
      let state = AppState(configuration: .mock, launchMode: .uiTestingLiveAuth,
        repository: ControlledProfileRepository(loadGates: [profile]), brightnessManager: MockBrightnessController())
      state.didInitializeAuth = true; state.route = .signedOut
      let harness = BrowserOwnerHarness()
      var owner: MobileAuthCoordinator? = harness.owner(state)
      let launchNonce = harness.nonce, launchURL = harness.callbackURL
      owner!.handleLaunchInputOnce(verifier: "launch-A", nativeAttempt: launchNonce, callbackURL: launchURL)
      let tasks = owner!.workTasks
      _ = await harness.entered(harness.exchangeGate, tasks: tasks)
      await harness.exchangeGate.complete(true)
      for task in tasks { await task.value }
      if replace { owner!.startBrowserAuth(isMock: false); await harness.open(owner!, window: 0) }
      let pending = harness.pending.snapshot(), authorization = NativeSessionTokenStore.requestAuthorization()
      owner!.handleLaunchInputOnce(verifier: "launch-A", nativeAttempt: launchNonce, callbackURL: launchURL)
      #expect(harness.pending.isCurrent(pending) && harness.pending.hasCodeVerifier() == replace)
      #expect(harness.exchanges.count == 1 && NativeSessionTokenStore.requestAuthorization() == authorization)
      #expect(owner!.authErrorMessage == nil && owner!.isOpening == replace)
      await harness.finish(&owner, tasks: tasks)
    }
  }
#endif
}


extension AppStateTests {
  @Test(arguments: ["exchange-held", "profile-held", "superseded"])
  func releasedOwnerLeavesRecoveryAndAcceptedProfileWithAppState(phase: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let original = try saveSession(), initial = ProfileLoadGate(), nextProfile = ProfileLoadGate()
      await initial.complete(true)
      let state = makeState(ControlledProfileRepository(loadGates: [initial, nextProfile]))
      await state.handleSignedInUserChange("same-user")
      let harness = BrowserOwnerHarness(), replacementHarness = BrowserOwnerHarness()
      replacementHarness.sessionToken = "native-B"
      var owner: MobileAuthCoordinator? = harness.owner(state)
      var replacement: MobileAuthCoordinator?
      weak var released = owner
      harness.seed("A"); owner!.handleAuthReturn(harness.callbackURL)
      let tasks = owner!.workTasks
      _ = await harness.entered(harness.exchangeGate, tasks: tasks)
      if phase == "profile-held" {
        await harness.exchangeGate.complete(true)
        _ = await harness.entered(nextProfile, tasks: tasks)
      }
      var replacementTasks: [Task<Void, Never>] = []
      if phase == "superseded" {
        replacement = replacementHarness.owner(state)
        replacementHarness.seed("B")
        replacement!.handleAuthReturn(replacementHarness.callbackURL)
        replacementTasks = replacement!.workTasks
        _ = await replacementHarness.entered(replacementHarness.exchangeGate, tasks: replacementTasks)
      }
      owner = nil
      #expect(released == nil)
      await harness.dispatched.join()
      // A cancellation cannot finish an uncooperative exchange; release then join it.
      await nextProfile.complete(true); await harness.exchangeGate.complete(true)
      for task in tasks { await task.value }
      #expect(!harness.pending.snapshot().isCorrelated)
      if phase == "superseded" {
        #expect(NativeSessionTokenStore.hasPendingAuth && state.route == .launching)
        #expect(NativeSessionTokenStore.requestAuthorization() == original)
        #expect(replacement!.authErrorMessage == nil)
        await replacementHarness.exchangeGate.complete(true)
        for task in replacementTasks { await task.value }
        #expect(NativeSessionTokenStore.requestAuthorization()?.bearerToken == "native-B")
      } else {
        #expect(!NativeSessionTokenStore.hasPendingAuth)
        #expect(NativeSessionTokenStore.requestAuthorization()?.bearerToken == (phase == "profile-held" ? "native-A" : original.bearerToken))
      }
      #expect(state.route == .ready && state.dashboardState == .loaded(.previewReady))
      await harness.finish(&owner, tasks: tasks)
      await replacementHarness.finish(&replacement, tasks: replacementTasks)
    }
  }

  @Test(arguments: ["valid-B", "RNG-failure", "nonce-RNG-failure", "invalid-URL", "invalid-origin"])
  func aNewBrowserRetiresAcceptedExchangeOnlyAfterItsInputsAreValid(change: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let original = try saveSession(), first = ProfileLoadGate(), reload = ProfileLoadGate()
      await first.complete(true); await reload.complete(true)
      let state = makeState(ControlledProfileRepository(loadGates: [first, reload]))
      await state.handleSignedInUserChange("same-user")
      let harness = BrowserOwnerHarness()
      var owner: MobileAuthCoordinator? = harness.owner(state)
      owner!.startBrowserAuth(isMock: false); await harness.open(owner!, window: 0)
      await harness.callback(0, url: harness.callbackURL)
      let accepted = owner!.workTasks
      _ = await harness.entered(harness.exchangeGate, tasks: accepted)
      let consumed = harness.pending.snapshot()
      harness.randomFails = change == "RNG-failure"
      harness.nonceFails = change == "nonce-RNG-failure"
      let url = change == "invalid-URL" ? URL(string: "http://unsafe.example")!
        : change == "invalid-origin" ? URL(string: "https://user@jov.ie")! : state.configuration.webBaseURL
      owner!.startSignIn(baseURL: url) { _ in harness.completions += 1 }
      let recovery = state.reconciliationTask
      let valid = change == "valid-B", pending = harness.pending.snapshot()
      #expect((recovery != nil) == valid)
      #expect(NativeSessionTokenStore.hasPendingAuth == !valid)
      #expect(harness.completions == (valid ? 0 : 1))
      if valid { await harness.open(owner!, window: 1) }
      else { #expect(harness.pending.isCurrent(consumed) && state.route == .launching) }
      await harness.exchangeGate.complete(true)
      for task in accepted { await task.value }
      await recovery?.value
      #expect(harness.pending.isCurrent(pending) == valid && harness.pending.hasCodeVerifier() == valid)
      #expect(harness.exchanges.count == 1 && owner!.authErrorMessage == nil)
      #expect(NativeSessionTokenStore.requestAuthorization()?.bearerToken == (valid ? original.bearerToken : "native-A"))
      #expect(state.route == .ready && !NativeSessionTokenStore.hasPendingAuth)
      if valid { #expect(harness.starts == [0, 1] && harness.completions == 0) }
      await harness.finish(&owner, tasks: accepted)
    }
  }

  @Test(arguments: [false, true])
  func explicitLogoutCancelsBrowserOrAcceptedExchangeBeforeSigningOut(accepted: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      _ = try saveSession()
      let initial = ProfileLoadGate(), recovery = ProfileLoadGate()
      await initial.complete(true); await recovery.complete(true)
      let revoker = MockSessionRevoker(result: .revoked)
      let state = makeState(ControlledProfileRepository(loadGates: [initial, recovery]), sessionRevoker: revoker)
      await state.handleSignedInUserChange("same-user")
      let harness = BrowserOwnerHarness()
      var owner: MobileAuthCoordinator? = harness.owner(state)
      owner!.startBrowserAuth(isMock: false)
      if accepted {
        await harness.open(owner!, window: 0); await harness.callback(0, url: harness.callbackURL)
      }
      let tasks = owner!.workTasks
      _ = await harness.entered(accepted ? harness.exchangeGate : harness.windows[0], tasks: tasks)
      owner!.cancelCurrentAuth()
      let recoveryTask = state.reconciliationTask
      #expect((recoveryTask != nil) == accepted)
      let completion = await state.signOut()
      await recoveryTask?.value
      #expect(completion != nil && state.route == .signedOut && NativeSessionTokenStore.load() == nil)
      harness.pending.save(codeVerifier: "later-B")
      let pending = harness.pending.snapshot()
      await harness.windows[0].complete(true); await harness.exchangeGate.complete(true)
      for task in tasks { await task.value }
      #expect(harness.pending.isCurrent(pending) && harness.pending.hasCodeVerifier())
      #expect(state.route == .signedOut && !NativeSessionTokenStore.hasPendingAuth)
      #expect(NativeSessionTokenStore.load() == nil && owner!.authErrorMessage == nil && !owner!.isOpening)
      #expect(await revoker.calls() == 1)
      await harness.finish(&owner, tasks: tasks)
    }
  }
}


extension AppStateTests {
  @Test(arguments: ["opening", "error"])
  func reconstructedViewsUseTheRetainedBrowserPresentation(phase: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let state = makeState(ControlledProfileRepository(loadGates: [])); state.route = .signedOut
      let harness = BrowserOwnerHarness()
      var owner: MobileAuthCoordinator? = harness.owner(state)
      owner!.startBrowserAuth(isMock: false)
      if phase == "opening" {
        _ = await harness.entered(harness.windows[0], tasks: owner!.workTasks)
      } else {
        await harness.open(owner!, window: 0)
        await harness.callback(0, error: CancellationError())
      }
      let opening = owner!.isOpening, error = owner!.authErrorMessage
      // These are compiled identity/projection controls, not hosted view lifecycle proof.
      var first: LiveRootContainer? = LiveRootContainer(appState: state, authCoordinator: owner!)
      #expect(first?.authCoordinator === owner)
      first = nil
      var replacement: AuthScreen? = AuthScreen(isMock: false, isSignInUnavailable: false,
        errorMessage: owner!.authErrorMessage, authCoordinator: owner!)
      #expect(replacement?.authCoordinator === owner)
      #expect(replacement?.authCoordinator.isOpening == opening && opening == (phase == "opening"))
      #expect(replacement?.errorMessage == error && error == (phase == "error" ? MobileAuthCopy.cancellation : nil))
      replacement = nil
      #expect(harness.exchanges.isEmpty && !NativeSessionTokenStore.hasPendingAuth)
      await harness.finish(&owner)
    }
  }
}

extension AppStateTests {
  @Test(arguments: [false, true])
  func retiredAuthOwnerCannotClearAnotherOwnersPendingAttempt(accepted: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let state = makeState(ControlledProfileRepository(loadGates: []))
      state.route = .signedOut
      let harness = BrowserOwnerHarness()
      var old: MobileAuthCoordinator? = harness.owner(state)
      var current: MobileAuthCoordinator? = harness.owner(state)
      old!.startBrowserAuth(isMock: false)
      await harness.open(old!, window: 0)
      if accepted { await harness.callback(0, url: harness.callbackURL) }
      let oldTasks = old!.workTasks
      if accepted { _ = await harness.entered(harness.exchangeGate, tasks: oldTasks) }
      current!.startBrowserAuth(isMock: false)
      await harness.open(current!, window: 1)
      let pendingB = harness.pending.snapshot()
      old!.cancelCurrentAuth()
      let recovery = state.reconciliationTask
      #expect(harness.pending.isCurrent(pendingB) && harness.pending.hasCodeVerifier())
      current!.cancelCurrentAuth()
      #expect(!harness.pending.hasCodeVerifier())
      await harness.finish(&old, tasks: oldTasks)
      await recovery?.value
      await harness.finish(&current)
    }
  }

  @Test(arguments: ["manual", "cold-inbox", "browser"])
  func oldCorrelatedReturnCannotConsumeCurrentPendingSignIn(ingress: String) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let original = try saveSession()
      let initial = ProfileLoadGate(), next = ProfileLoadGate()
      await initial.complete(true); await next.complete(true)
      let state = makeState(ControlledProfileRepository(loadGates: [initial, next]))
      await state.handleSignedInUserChange("same-user")
      let harness = BrowserOwnerHarness()
      harness.sessionToken = "native-B"
      harness.seed("old-verifier-A")
      let oldURL = harness.callbackURL
      var owner: MobileAuthCoordinator? = harness.owner(state)
      owner!.startBrowserAuth(isMock: false)
      await harness.open(owner!, window: 0)
      let pendingB = harness.pending.snapshot(), currentURL = harness.callbackURL
      if ingress == "cold-inbox" {
        MobileAuthCallbackURLInbox.shared.enqueue(oldURL)
        owner!.drainPendingAuthCallbackURLs()
      } else if ingress == "browser" { await harness.callback(0, url: oldURL) }
      else { owner!.handleAuthReturn(oldURL) }
      #expect(harness.pending.isCurrent(pendingB) && harness.pending.hasCodeVerifier())
      #expect(harness.exchanges.isEmpty && !NativeSessionTokenStore.hasPendingAuth)
      #expect(NativeSessionTokenStore.requestAuthorization() == original && state.route == .ready)
      owner!.handleAuthReturn(currentURL)
      let tasks = owner!.workTasks
      _ = await harness.entered(harness.exchangeGate, tasks: tasks)
      await harness.exchangeGate.complete(true)
      for task in tasks { await task.value }
      #expect(harness.exchanges.count == 1 && harness.exchanges.first?.nativeAttempt == harness.nonce)
      #expect(NativeSessionTokenStore.requestAuthorization()?.bearerToken == "native-B")
      await harness.finish(&owner, tasks: tasks)
    }
  }
}

extension AppStateTests {
  @Test(arguments: [false, true])
  func explicitPreconsumeRejectionAllowsOneLaterManualReturnWithoutAutomaticReplay(previousSession: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      var original: NativeRequestAuthorization?
      if previousSession { original = try saveSession() }
      let profiles = [ProfileLoadGate(), ProfileLoadGate(), ProfileLoadGate()]
      for gate in profiles { await gate.complete(true) }
      let state = makeState(ControlledProfileRepository(loadGates: profiles))
      if previousSession { await state.handleSignedInUserChange("same-user") }
      else { state.route = .signedOut }
      let harness = BrowserOwnerHarness()
      harness.exchangeFailure = NativeAuthExchangeError.rejectedBeforeConsume(reason: "wrong_attempt")
      harness.seed("verifier-A")
      var owner: MobileAuthCoordinator? = harness.owner(state)
      let url = harness.callbackURL
      let foreignURL = URL(string: url.absoluteString.replacingOccurrences(of: harness.nonce,
        with: String(repeating: "B", count: 43)))!
      owner!.handleAuthReturn(url)
      let first = owner!.workTasks
      _ = await harness.entered(harness.exchangeGate, tasks: first)
      // This duplicate must not survive rearm as an automatic view-drain retry.
      MobileAuthCallbackURLInbox.shared.enqueue(url)
      MobileAuthCallbackURLInbox.shared.enqueue(foreignURL)
      await harness.exchangeGate.complete(true)
      for task in first { await task.value }
      #expect(harness.pending.hasCodeVerifier() && !NativeSessionTokenStore.hasPendingAuth)
      #expect(NativeSessionTokenStore.requestAuthorization() == original)
      #expect(state.route == (previousSession ? .ready : .signedOut))
      #expect(owner!.authErrorMessage == MobileAuthCopy.failure)
      let remaining = MobileAuthCallbackURLInbox.shared.drain()
      #expect(remaining == [foreignURL])
      for callback in remaining { owner!.handleAuthReturn(callback) }
      #expect(harness.exchanges.count == 1 && owner!.workTasks.isEmpty)
      harness.exchangeFailure = nil
      MobileAuthCallbackURLInbox.shared.enqueue(url)
      owner!.drainPendingAuthCallbackURLs()
      let retry = owner!.workTasks
      for task in retry { await task.value }
      #expect(harness.exchanges.count == 2 && harness.exchanges.first == harness.exchanges.last)
      #expect(!harness.pending.snapshot().isCorrelated && owner!.authErrorMessage == nil)
      #expect(NativeSessionTokenStore.requestAuthorization()?.bearerToken == "native-A" && state.route == .ready)
      await harness.finish(&owner, tasks: first + retry)
    }
  }

  @Test(arguments: ["untagged", "OTT", "transport", "decode", "missing-credential", "persistence"])
  func otherExchangeOutcomesNeverReopenThePendingAttempt(outcome: String) async throws {
    try await withNativeAuthSecurityScript { @MainActor script in
      let state = makeState(ControlledProfileRepository(loadGates: []),
        sessionRevoker: MockSessionRevoker(result: .revoked))
      state.route = .signedOut
      let harness = BrowserOwnerHarness()
      switch outcome {
      case "untagged": harness.exchangeFailure = NativeAuthExchangeError.requestFailed(statusCode: 401, reason: "wrong_attempt")
      case "OTT": harness.exchangeFailure = NativeAuthExchangeError.requestFailed(statusCode: 401, reason: "ott_invalid")
      case "transport": harness.exchangeFailure = NativeAuthExchangeError.transportFailed(code: URLError.timedOut.rawValue)
      case "decode": harness.exchangeFailure = NativeAuthExchangeError.decodingFailed
      case "persistence": script.configure(addStatus: errSecDuplicateItem)
      default: harness.sessionToken = ""
      }
      harness.seed("verifier-A")
      var owner: MobileAuthCoordinator? = harness.owner(state)
      let url = harness.callbackURL
      owner!.handleAuthReturn(url)
      let tasks = owner!.workTasks
      _ = await harness.entered(harness.exchangeGate, tasks: tasks)
      await harness.exchangeGate.complete(true)
      for task in tasks { await task.value }
      #expect(!harness.pending.snapshot().isCorrelated && !harness.pending.hasCodeVerifier())
      #expect(!NativeSessionTokenStore.hasPendingAuth && NativeSessionTokenStore.load() == nil)
      #expect(state.route == .signedOut && owner!.authErrorMessage == MobileAuthCopy.failure)
      #expect(script.calls.contains("add") == (outcome == "persistence"))
      owner!.handleAuthReturn(url)
      #expect(harness.exchanges.count == 1 && owner!.workTasks.isEmpty)
      await harness.finish(&owner, tasks: tasks)
    }
  }

  @Test(arguments: [false, true])
  func latePreconsumeResponseCannotReopenOrReportFailureOverReplacement(browserReplacement: Bool) async throws {
    try await withNativeSessionTokenStoreTestIsolation { @MainActor in
      let state = makeState(ControlledProfileRepository(loadGates: []))
      state.route = .signedOut
      let harness = BrowserOwnerHarness()
      harness.exchangeFailure = NativeAuthExchangeError.rejectedBeforeConsume(reason: "wrong_attempt")
      harness.seed("verifier-A")
      var owner: MobileAuthCoordinator? = harness.owner(state)
      owner!.handleAuthReturn(harness.callbackURL)
      let old = owner!.workTasks
      _ = await harness.entered(harness.exchangeGate, tasks: old)
      if browserReplacement {
        owner!.startSignIn(baseURL: state.configuration.webBaseURL) { _ in }
        await harness.open(owner!, window: 0)
      } else {
        harness.nonce = String(repeating: "B", count: 43)
        harness.seed("verifier-B")
      }
      let recovery = state.reconciliationTask, pendingB = harness.pending.snapshot()
      await harness.exchangeGate.complete(true)
      for task in old { await task.value }
      await recovery?.value
      #expect(harness.pending.isCurrent(pendingB) && harness.pending.hasCodeVerifier())
      #expect(owner!.authErrorMessage == nil && harness.exchanges.count == 1)
      await harness.finish(&owner, tasks: old)
    }
  }
}
