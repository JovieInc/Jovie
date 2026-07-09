import Foundation
import Observation

enum DashboardLoadState: Equatable {
  case idle
  case loading
  case loaded(MobileMeResponse)
  case error(String)
}

protocol AppStateRepository: Sendable {
  func loadMe(for clerkUserID: String) async throws -> MeRepositoryResult
  func clearCachedUser(_ clerkUserID: String) async
  func cachedSnapshot(for clerkUserID: String) async -> MobileMeResponse?
}

extension AppStateRepository {
  /// Default: no cached snapshot. Concrete repositories that persist profiles
  /// (e.g. ``MeRepository``) override this to enable instant cache-first paint.
  func cachedSnapshot(for _: String) async -> MobileMeResponse? { nil }
}

extension MeRepository: AppStateRepository {}

@MainActor
@Observable
final class AppState {
  let configuration: AppConfiguration
  let launchMode: LaunchMode
  let brightnessManager: BrightnessControlling

  var route: AppRouter = .launching
  var dashboardState: DashboardLoadState = .idle
  var isOffline = false
  var didLoadClerk = false
  var activeUserID: String?

  private let repository: AppStateRepository
  private let launchDate = Date()
  private var loadingUserID: String?
  // Matches SplashView's cinematic entrance (JovieMotion.cinematicDuration)
  // so the primary logo reveal completes before the route crossfade starts.
  private let minimumSplashDuration = JovieMotion.cinematicDuration

  init(
    configuration: AppConfiguration,
    launchMode: LaunchMode = .current(),
    repository: AppStateRepository,
    brightnessManager: BrightnessControlling
  ) {
    self.configuration = configuration
    self.launchMode = launchMode
    self.repository = repository
    self.brightnessManager = brightnessManager
  }

  func completeLaunch() async {
    let elapsed = Date().timeIntervalSince(launchDate)
    let delay = max(0, minimumSplashDuration - elapsed)
    if delay > 0 {
      try? await Task.sleep(for: .seconds(delay))
    }

    switch launchMode {
    case .live, .uiTestingAutoAuth, .uiTestingLiveAuth, .uiTestingRealBrowserAuth:
      didLoadClerk = true
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
    case .uiTestingReady, .uiTestingChat, .uiTestingSettings, .uiTestingVenueMode:
      route = .ready
      dashboardState = .loaded(.previewReady)
      isOffline = false
    case .uiTestingChatEntityFixture:
      // Unlike the other `.ready` UI-testing modes, this one needs a real
      // `ChatRepository` instance so `RootView` can seed it with
      // `MobileChatEntityFixture.default` -- that seeding only happens
      // inside the `.task(id: appState.activeUserID)` block, which
      // short-circuits to a nil repository (rendering the empty-state
      // placeholder instead of the fixture transcript) unless
      // `activeUserID` is non-nil. Mirrors the synthetic id already used by
      // the auth-callback UI-testing path (`"user_ui_auth_callback"`).
      route = .ready
      dashboardState = .loaded(.previewReady)
      isOffline = false
      activeUserID = "user_ui_testing_chat_entity_fixture"
    case .uiTestingAudience:
      route = .ready
      dashboardState = .loaded(.previewReady)
      isOffline = false
    case .uiTestingQRUnavailable:
      route = .ready
      dashboardState = .loaded(.previewReadyWithoutQR)
      isOffline = false
    case .uiTestingChatOffline:
      route = .ready
      dashboardState = .loaded(.previewReady)
      isOffline = true
    case .uiTestingProfileError:
      route = .ready
      dashboardState = .error("Couldn't load your profile.")
      isOffline = false
    case .uiTestingNeedsOnboarding:
      route = .needsOnboarding
      dashboardState = .idle
      isOffline = false
    case .uiTestingSplash:
      route = .launching
      dashboardState = .idle
      isOffline = false
    }
  }

  func handleSignedInUserChange(_ userID: String?) async {
    guard launchMode.usesLiveClerk, didLoadClerk else { return }

    if let userID, loadingUserID == userID {
      return
    }

    activeUserID = userID

    guard let userID else {
      Observability.clearUser()
      loadingUserID = nil
      route = .signedOut
      dashboardState = .idle
      isOffline = false
      MobileAuthDiagnostics.record("route_signed_out")
      return
    }

    Observability.setUser(id: userID)
    loadingUserID = userID
    defer {
      if loadingUserID == userID {
        loadingUserID = nil
      }
    }

    // Cache-first: paint the last persisted profile instantly so returning
    // users never wait on the network to see their dashboard. The network
    // revalidation below silently swaps in fresh data when it lands.
    let cachedSnapshot = await repository.cachedSnapshot(for: userID)
    guard activeUserID == userID, loadingUserID == userID else { return }

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
      guard activeUserID == userID, loadingUserID == userID else { return }
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
      }
    } catch {
      guard activeUserID == userID, loadingUserID == userID else { return }

      var didTransportFail = false

      if let error = error as? APIClientError {
        switch error {
        case .missingToken, .requestFailed(statusCode: 401):
          Observability.clearUser()
          route = .signedOut
          dashboardState = .idle
          isOffline = false
          MobileAuthDiagnostics.record("route_signed_out", detail: error.localizedDescription)
          return
        case .transportFailed:
          didTransportFail = true
        case .decodingFailed, .invalidResponse, .requestFailed:
          break
        }
      }

      route = .ready
      dashboardState = .error("Couldn't load your profile.")
      isOffline = didTransportFail
      MobileAuthDiagnostics.record("mobile_me_error", detail: error.localizedDescription)
    }
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
    NativeSessionTokenStore.clear()

    let userID = activeUserID
    Observability.clearUser()
    activeUserID = nil
    loadingUserID = nil
    route = .signedOut
    dashboardState = .idle
    isOffline = false
    MobileAuthDiagnostics.record("route_signed_out")

    if let userID {
      await repository.clearCachedUser(userID)
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
}
