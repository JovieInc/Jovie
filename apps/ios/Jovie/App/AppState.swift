import Foundation
import Observation

enum DashboardLoadState: Equatable {
  case idle
  case loading
  case loaded(MobileMeResponse)
  case error(String)
}

protocol AppStateRepository: Sendable {
  func loadMe(for userID: String) async throws -> MeRepositoryResult
  func loadMe(for userID: String, ifOwnedBy ownership: NativeSessionOwnership) async throws
    -> MeRepositoryResult
  func clearCachedUser(_ userID: String) async
  func clearCachedUser(_ userID: String, ifOwnedBy ownership: NativeSessionOwnership) async
  func cachedSnapshot(for userID: String) async -> MobileMeResponse?
}

extension AppStateRepository {
  func loadMe(for userID: String, ifOwnedBy _: NativeSessionOwnership) async throws
    -> MeRepositoryResult
  {
    try await loadMe(for: userID)
  }

  /// Default: no cached snapshot. Concrete repositories that persist profiles
  /// (e.g. ``MeRepository``) override this to enable instant cache-first paint.
  func cachedSnapshot(for _: String) async -> MobileMeResponse? { nil }
}

extension MeRepository: AppStateRepository {}

@MainActor
protocol PushNotificationCoordinating {
  func activate() async
  func deactivate() async
  func deactivate(for claim: NativeSessionCleanupClaim) async
  func deactivateLocally(ifOwnedBy ownership: NativeSessionOwnership) async
}

@MainActor
struct NoopPushNotificationCoordinator: PushNotificationCoordinating {
  func activate() async {}
  func deactivate() async {}
  func deactivate(for _: NativeSessionCleanupClaim) async {}
  func deactivateLocally(ifOwnedBy _: NativeSessionOwnership) async {}
}

struct ProfileLoadContext {
  let ownership: NativeSessionOwnership?
  let canContinue: () -> Bool

  static func live(for userID: String) -> Self? {
    guard let ownership = NativeSessionTokenStore.captureOwnership(for: userID) else { return nil }
    return Self(ownership: ownership) {
      NativeSessionTokenStore.canContinueProfileLoad(ownedBy: ownership)
    }
  }

  static func unmanaged(canContinue: @escaping () -> Bool = { true }) -> Self {
    Self(ownership: nil, canContinue: canContinue)
  }
}

@MainActor
@Observable
final class AppState {
  let configuration: AppConfiguration
  let launchMode: LaunchMode
  let brightnessManager: BrightnessControlling

  var route: AppRouter = .launching
  var dashboardState: DashboardLoadState = .idle
  var isOffline = false
  var didInitializeAuth = false
  var activeUserID: String?
  private(set) var activeSessionOwnership: NativeSessionOwnership?

  private let repository: AppStateRepository
  private let sessionRevoker: NativeSessionRevoking
  private let pushNotifications: PushNotificationCoordinating
  private let chatCache: ChatCache
  private let audienceHighlightsCache: AudienceHighlightsCache
  private let actionLoopCache: ActionLoopCache
  private let launchDate = Date()
  private struct ProfileLoadAttempt {
    let id = UUID()
    let userID: String
    let context: ProfileLoadContext
    var canContinue: () -> Bool { context.canContinue }
  }

  private let captureProfileLoadCurrentness: (String) -> ProfileLoadContext?
  private var profileLoadAttempt: ProfileLoadAttempt?
  private var profileLoadTask: Task<Void, Never>?
  // Matches SplashView's cinematic entrance (JovieMotion.cinematicDuration)
  // so the primary logo reveal completes before the route crossfade starts.
  private let minimumSplashDuration = JovieMotion.cinematicDuration

  init(
    configuration: AppConfiguration,
    launchMode: LaunchMode = .current(),
    repository: AppStateRepository,
    brightnessManager: BrightnessControlling,
    sessionRevoker: NativeSessionRevoking? = nil,
    pushNotifications: PushNotificationCoordinating? = nil,
    chatCache: ChatCache? = nil,
    audienceHighlightsCache: AudienceHighlightsCache? = nil,
    actionLoopCache: ActionLoopCache? = nil,
    captureProfileLoadCurrentness: @escaping (String) -> ProfileLoadContext? = {
      ProfileLoadContext.live(for: $0)
    }
  ) {
    self.configuration = configuration
    self.launchMode = launchMode
    self.repository = repository
    self.brightnessManager = brightnessManager
    self.sessionRevoker = sessionRevoker ?? NativeSessionRevoker(baseURL: configuration.apiBaseURL)
    self.pushNotifications = pushNotifications ?? NoopPushNotificationCoordinator()
    self.chatCache = chatCache ?? ChatCache()
    self.audienceHighlightsCache = audienceHighlightsCache ?? AudienceHighlightsCache()
    self.actionLoopCache = actionLoopCache ?? ActionLoopCache()
    self.captureProfileLoadCurrentness = captureProfileLoadCurrentness
  }

  func completeLaunch() async {
    let elapsed = Date().timeIntervalSince(launchDate)
    let delay = max(0, minimumSplashDuration - elapsed)
    if delay > 0 {
      try? await Task.sleep(for: .seconds(delay))
    }

    switch launchMode {
    case .live, .uiTestingLiveAuth, .uiTestingRealBrowserAuth:
      didInitializeAuth = true
    case .unitTesting:
      route = .signedOut
      dashboardState = .idle
      isOffline = false
    case .uiTestingAuthCallback:
      if route == .launching {
        route = .signedOut
        dashboardState = .idle
      }
    case .uiTestingSignedOut:
      route = .signedOut
      dashboardState = .idle
    case .uiTestingReady,
         .uiTestingChat,
         .uiTestingWhatsNew,
         .uiTestingSettings,
         .uiTestingVenueMode,
         .uiTestingAudience,
         .uiTestingLibrary,
         .uiTestingLibraryEmpty,
         .uiTestingInbox,
         .uiTestingInboxLoading,
         .uiTestingCalendar,
         .uiTestingCalendarLoading:
      route = .ready
      dashboardState = .loaded(.previewReady)
      isOffline = false
    case .uiTestingChatEntityFixture, .uiTestingChatAllComponents:
      // Unlike the other `.ready` UI-testing modes, fixture chat modes need a
      // real `ChatRepository` instance so `RootView` can seed the timeline --
      // that seeding only happens inside the `.task(id: appState.activeUserID)`
      // block, which short-circuits to a nil repository (rendering the
      // empty-state placeholder instead of the fixture transcript) unless
      // `activeUserID` is non-nil. Mirrors the synthetic id already used by
      // the auth-callback UI-testing path (`"user_ui_auth_callback"`).
      route = .ready
      dashboardState = .loaded(.previewReady)
      isOffline = false
      activeUserID = launchMode == .uiTestingChatAllComponents
        ? "user_ui_testing_chat_all_components"
        : "user_ui_testing_chat_entity_fixture"
    case .uiTestingQRUnavailable:
      route = .ready
      dashboardState = .loaded(.previewReadyWithoutQR)
      isOffline = false
    case .uiTestingChatOffline, .uiTestingInboxOffline, .uiTestingCalendarOffline:
      route = .ready
      dashboardState = .loaded(.previewReady)
      isOffline = true
    case .uiTestingProfileError:
      route = .ready
      dashboardState = .error("Couldn't load your profile.")
      isOffline = false
    case .uiTestingNeedsOnboarding, .uiTestingNeedsOnboardingUnauthorized:
      route = .needsOnboarding
      dashboardState = .idle
      isOffline = false
    case .uiTestingWaitlistPending:
      route = .waitlistPending
      dashboardState = .loaded(.previewWaitlistPending)
      isOffline = false
    case .uiTestingSplash:
      route = .launching
      dashboardState = .idle
      isOffline = false
    }
  }

  func handleSignedInUserChange(_ userID: String?) async {
    guard launchMode.usesLiveAuth, didInitializeAuth else { return }

    let newAttempt: ProfileLoadAttempt?
    if let userID {
      guard let context = captureProfileLoadCurrentness(userID) else { return }
      newAttempt = ProfileLoadAttempt(userID: userID, context: context)
    } else {
      newAttempt = nil
    }

    if let userID, let attempt = profileLoadAttempt,
       attempt.userID == userID, attempt.canContinue() {
      return
    }

    let previousUserID = activeUserID
    guard let userID, let attempt = newAttempt else {
      let claim = NativeSessionTokenStore.claimCleanup()
      var retiredTask: Task<Void, Never>?
      NativeSessionTokenStore.performIfCurrent(claim) { _ in
        activeUserID = nil
        activeSessionOwnership = nil
        retiredTask = retireProfileLoad()
      }
      retiredTask?.cancel()
      retiredTask = nil
      if previousUserID != nil {
        await pushNotifications.deactivate(for: claim)
      }
      NativeSessionTokenStore.performIfCurrent(claim) { _ in
        retiredTask = resetSignedOutPresentation().task
      }
      retiredTask?.cancel()
      return
    }

    let retiredTask = retireProfileLoad()
    activeUserID = userID
    activeSessionOwnership = attempt.context.ownership
    Observability.setUser(id: userID)
    let pushNotifications = pushNotifications
    Task {
      await pushNotifications.activate()
    }
    profileLoadAttempt = attempt
    // Repository waits belong to the installed profile, not the initiating view.
    // Keep the owner weak between waits; only terminal cleanup retains it async.
    let task = Task { [weak self, repository] in
      defer { self?.finishProfileLoad(attempt) }
      let cachedSnapshot = await repository.cachedSnapshot(for: userID)
      guard self?.presentCachedProfile(cachedSnapshot, for: attempt) == true else { return }
      do {
        let result: MeRepositoryResult
        if let ownership = attempt.context.ownership {
          result = try await repository.loadMe(for: userID, ifOwnedBy: ownership)
        } else {
          result = try await repository.loadMe(for: userID)
        }
        self?.presentProfileResult(result, for: attempt)
      } catch {
        // The receipt, not a still-active load UUID, authorizes terminal effects.
        if let error = error as? NativeSessionRequestError {
          if case let .expired(receipt) = error { await self?.handleExpiredSession(receipt) }
          return
        }
        if error is CancellationError { return }
        guard self?.isActive(attempt) == true else { return }
        if attempt.context.ownership == nil, let error = error as? APIClientError {
          switch error {
          case .missingToken, .requestFailed(statusCode: 401):
            await self?.handleExpiredSession()
            return
          default:
            break
          }
        }
        self?.presentProfileFailure(error, for: attempt)
      }
    }
    profileLoadTask = task
    retiredTask?.cancel()
    await task.value
  }

  // Detachment is safe under the token-store lock; cancellation is not, because
  // a task's cancellation handlers can synchronously re-enter that store.
  private func retireProfileLoad() -> Task<Void, Never>? {
    let task = profileLoadTask
    profileLoadAttempt = nil
    profileLoadTask = nil
    return task
  }

  private func finishProfileLoad(_ attempt: ProfileLoadAttempt) {
    guard profileLoadAttempt?.id == attempt.id else { return }
    _ = retireProfileLoad()
  }

  private func presentCachedProfile(
    _ cachedSnapshot: MobileMeResponse?, for attempt: ProfileLoadAttempt
  ) -> Bool {
    // Cache-first: paint the last persisted profile instantly so returning
    // users never wait on the network to see their dashboard. The network
    // revalidation below silently swaps in fresh data when it lands.
    guard isActive(attempt), attempt.canContinue() else { return false }

    if let cachedSnapshot {
      apply(response: cachedSnapshot)
      isOffline = false
      MobileAuthDiagnostics.record(
        "mobile_me_cache_hit",
        detail: "state=\(cachedSnapshot.state.rawValue)"
      )
    } else {
      // Paint the interactive shell immediately with a loading skeleton instead
      // of holding first-run users on SplashView for the full /me round-trip.
      route = .ready
      dashboardState = .loading
      isOffline = false
      MobileAuthDiagnostics.record("mobile_me_loading")
    }

    return true
  }

  private func presentProfileResult(_ result: MeRepositoryResult, for attempt: ProfileLoadAttempt) {
    guard isActive(attempt), attempt.canContinue() else { return }
    isOffline = result.isStale

    switch result.response.state {
    case .ready:
      apply(response: result.response)
      Observability.addBreadcrumb(
        .appRouteAfterLogin,
        context: ["route": "ready"]
      )
      MobileAuthDiagnostics.record("route_ready", detail: "state=ready")
    case .needsOnboarding:
      apply(response: result.response)
      Observability.addBreadcrumb(
        .appRouteAfterLogin,
        context: ["route": "needs_onboarding"]
      )
      MobileAuthDiagnostics.record(
        "route_needs_onboarding",
        detail: "state=needs_onboarding"
      )
    case .waitlistPending:
      apply(response: result.response)
      Observability.addBreadcrumb(
        .appRouteAfterLogin,
        context: ["route": "waitlist_pending"]
      )
      MobileAuthDiagnostics.record(
        "route_waitlist_pending",
        detail: "state=waitlist_pending"
      )
    }
  }

  private func presentProfileFailure(_ error: Error, for attempt: ProfileLoadAttempt) {
    guard isActive(attempt), attempt.canContinue() else { return }
    var didTransportFail = false
    if let error = error as? APIClientError, case .transportFailed = error {
      didTransportFail = true
    }
    route = .ready
    dashboardState = .error("Couldn't load your profile.")
    isOffline = didTransportFail
    MobileAuthDiagnostics.record("mobile_me_error", detail: error.localizedDescription)
  }

  private func isActive(_ attempt: ProfileLoadAttempt) -> Bool {
    activeUserID == attempt.userID && profileLoadAttempt?.id == attempt.id
  }

  /// Maps a resolved profile response onto the navigation route and dashboard
  /// state. Shared by the instant cache paint and the network revalidation so
  /// both paths transition identically (and never disagree on the route).
  private func apply(response: MobileMeResponse) {
    switch response.state {
    case .ready:
      route = .ready
      dashboardState = .loaded(response)
    case .needsOnboarding:
      route = .needsOnboarding
      // Keep the resolved profile payload so continueOnWebURL and cache paint
      // stay instant — .idle forced a generic fallback URL and extra reload work.
      dashboardState = .loaded(response)
    case .waitlistPending:
      route = .waitlistPending
      dashboardState = .loaded(response)
    }
  }

  func retry() async {
    if launchMode.recoversProfileErrorOnRetry {
      route = .ready
      dashboardState = .loaded(.previewReady)
      isOffline = false
      return
    }

    await handleSignedInUserChange(activeUserID)
  }

  @discardableResult
  func signOut() async -> NativeSessionCleanupCompletion? {
    let claim = NativeSessionTokenStore.claimCleanup(invalidatingAuthIntent: true)
    var userID: String?
    var retiredTask: Task<Void, Never>?
    guard NativeSessionTokenStore.performIfCurrent(claim, { _ in
      userID = activeUserID
      retiredTask = retireProfileLoad()
    }) else { return nil }
    retiredTask?.cancel()
    await pushNotifications.deactivate(for: claim)
    // DELETE may have rotated A. Capture POST's bearer within the same claim.
    guard let context = NativeSessionTokenStore.captureSessionContext(for: claim) else { return nil }
    let revocation = await sessionRevoker.revokeSession(authorizedBy: context.authorization)
    NativeSessionTokenStore.performIfCurrent(claim) { _ in
      if case let .failed(statusCode) = revocation {
        MobileAuthDiagnostics.record(
          "native_session_revocation_failed",
          detail: statusCode.map(String.init) ?? "transport"
        )
      }
    }

    // Network failure still clears this operation's local session.
    return await finishCleanup(claim, for: userID)
  }

  /// A terminal authenticated request has already proven the local session unusable.
  /// Return to native sign-in without attempting another remote revocation with that token.
  func handleExpiredSession() async {
    let claim = NativeSessionTokenStore.claimCleanup()
    var userID: String?
    var retiredTask: Task<Void, Never>?
    guard NativeSessionTokenStore.performIfCurrent(claim, { _ in
      userID = activeUserID
      retiredTask = retireProfileLoad()
    }) else { return }
    // Legacy expiry can originate in this task too. Finish cleanup before cancel.
    defer { retiredTask?.cancel() }
    await pushNotifications.deactivate(for: claim)
    _ = await finishCleanup(claim, for: userID)
  }

  func handleExpiredSession(_ receipt: NativeSessionExpiryReceipt) async {
    var userID: String?
    var retiredTask: Task<Void, Never>?
    guard NativeSessionTokenStore.performIfCurrent(receipt.ownership, {
      let reset = resetSignedOutPresentation()
      userID = reset.userID
      retiredTask = reset.task
    }) else { return }
    // This receipt may come from the detached task; never cancel or join it early.
    defer { retiredTask?.cancel() }
    await pushNotifications.deactivateLocally(ifOwnedBy: receipt.ownership)
    await clearCaches(for: userID, ifOwnedBy: receipt.ownership)
  }

  private func finishCleanup(
    _ claim: NativeSessionCleanupClaim, for userID: String?
  ) async -> NativeSessionCleanupCompletion? {
    guard let completion = NativeSessionTokenStore.completeCleanup(claim) else { return nil }
    var retiredTask: Task<Void, Never>?
    guard NativeSessionTokenStore.performIfCurrent(completion, {
      retiredTask = resetSignedOutPresentation().task
    }) else { return nil }
    defer { retiredTask?.cancel() }
    await clearCaches(for: userID, ifOwnedBy: completion.ownership)
    return NativeSessionTokenStore.performIfCurrent(completion, {}) ? completion : nil
  }

  private func resetSignedOutPresentation() -> (userID: String?, task: Task<Void, Never>?) {
    let userID = activeUserID
    Observability.clearUser()
    activeUserID = nil
    activeSessionOwnership = nil
    let task = retireProfileLoad()
    route = .signedOut
    dashboardState = .idle
    isOffline = false
    MobileAuthDiagnostics.record("route_signed_out")
    return (userID, task)
  }

  private func clearCaches(for userID: String?, ifOwnedBy cleanupOwnership: NativeSessionOwnership) async {
    if let userID {
      await repository.clearCachedUser(userID, ifOwnedBy: cleanupOwnership)
      await chatCache.remove(for: userID, ifOwnedBy: cleanupOwnership)
      await audienceHighlightsCache.remove(for: userID, ifOwnedBy: cleanupOwnership)
      await actionLoopCache.remove(for: userID, ifOwnedBy: cleanupOwnership)
    }
  }

  var continueOnWebURL: URL {
    switch dashboardState {
    case let .loaded(response):
      return URL(string: response.continueOnWebURL) ?? configuration.webBaseURL
    case .idle, .loading, .error:
      return configuration.webBaseURL.appending(path: "app")
    }
  }

  var billingURL: URL {
    continueOnWebURL.appending(path: "settings/billing")
  }

  var accountURL: URL {
    configuration.webBaseURL.appending(path: "app/settings/account")
  }
}
