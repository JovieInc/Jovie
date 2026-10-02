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
  func clearCachedUser(_ userID: String) async
  func clearCachedUser(_ userID: String, ifOwnedBy ownership: NativeSessionOwnership) async
  func cachedSnapshot(for userID: String) async -> MobileMeResponse?
}

extension AppStateRepository {
  /// Default: no cached snapshot. Concrete repositories that persist profiles
  /// (e.g. ``MeRepository``) override this to enable instant cache-first paint.
  func cachedSnapshot(for _: String) async -> MobileMeResponse? { nil }
}

extension MeRepository: AppStateRepository {}

@MainActor
protocol PushNotificationCoordinating {
  func activate() async
  func deactivate() async
}

@MainActor
struct NoopPushNotificationCoordinator: PushNotificationCoordinating {
  func activate() async {}
  func deactivate() async {}
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
    let canContinue: () -> Bool
  }

  private let captureProfileLoadCurrentness: () -> (() -> Bool)
  private var profileLoadAttempt: ProfileLoadAttempt?
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
    captureProfileLoadCurrentness: @escaping () -> (() -> Bool) = {
      let ownership = NativeSessionTokenStore.captureSessionContext().ownership
      return { NativeSessionTokenStore.canContinueProfileLoad(ownedBy: ownership) }
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

    if let userID, let attempt = profileLoadAttempt,
       attempt.userID == userID, attempt.canContinue() {
      return
    }

    let previousUserID = activeUserID
    activeUserID = userID

    guard let userID else {
      if previousUserID != nil {
        await pushNotifications.deactivate()
      }
      Observability.clearUser()
      profileLoadAttempt = nil
      route = .signedOut
      dashboardState = .idle
      isOffline = false
      MobileAuthDiagnostics.record("route_signed_out")
      return
    }

    Observability.setUser(id: userID)
    let pushNotifications = pushNotifications
    Task {
      await pushNotifications.activate()
    }
    let attempt = ProfileLoadAttempt(
      userID: userID,
      canContinue: captureProfileLoadCurrentness()
    )
    profileLoadAttempt = attempt
    defer {
      if profileLoadAttempt?.id == attempt.id {
        profileLoadAttempt = nil
      }
    }

    // Cache-first: paint the last persisted profile instantly so returning
    // users never wait on the network to see their dashboard. The network
    // revalidation below silently swaps in fresh data when it lands.
    let cachedSnapshot = await repository.cachedSnapshot(for: userID)
    guard isActive(attempt), attempt.canContinue() else { return }

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

    do {
      let result = try await repository.loadMe(for: userID)
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
    } catch {
      guard isActive(attempt) else { return }

      var didTransportFail = false

      if let error = error as? APIClientError {
        switch error {
        case .missingToken, .requestFailed(statusCode: 401):
          // The client may already have cleared a genuinely expired session.
          // Preserve terminal handling before the presentation ownership check.
          await handleExpiredSession()
          return
        case .transportFailed:
          didTransportFail = true
        case .decodingFailed, .invalidResponse, .requestFailed, .profileCompletionFailed:
          break
        }
      }

      guard attempt.canContinue() else { return }
      route = .ready
      dashboardState = .error("Couldn't load your profile.")
      isOffline = didTransportFail
      MobileAuthDiagnostics.record("mobile_me_error", detail: error.localizedDescription)
    }
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

  func signOut() async {
    await pushNotifications.deactivate()
    let revocation = await sessionRevoker.revokeCurrentSession()
    if case let .failed(statusCode) = revocation {
      MobileAuthDiagnostics.record(
        "native_session_revocation_failed",
        detail: statusCode.map(String.init) ?? "transport"
      )
    }

    // Always clear the device token even if the network is unavailable. A
    // remote revocation failure must never trap someone in an authenticated UI.
    NativeSessionTokenStore.clear()

    await resetToSignedOut()
  }

  /// A terminal authenticated request has already proven the local session unusable.
  /// Return to native sign-in without attempting another remote revocation with that token.
  func handleExpiredSession() async {
    await pushNotifications.deactivate()
    NativeSessionTokenStore.clear()
    await resetToSignedOut()
  }

  private func resetToSignedOut() async {
    let cleanupOwnership = NativeSessionTokenStore.captureSessionContext().ownership
    let userID = activeUserID
    Observability.clearUser()
    activeUserID = nil
    profileLoadAttempt = nil
    route = .signedOut
    dashboardState = .idle
    isOffline = false
    MobileAuthDiagnostics.record("route_signed_out")

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
