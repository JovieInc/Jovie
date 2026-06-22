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
    let delay = max(0, 0.35 - elapsed)
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
    case .uiTestingRecentConversations:
      await UITestingChatFixtures.seedRecentConversationCache()
      activeUserID = UITestingChatFixtures.recentConversationUserID
      route = .ready
      dashboardState = .loaded(.previewReady)
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
      route = .launching
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
      dashboardState = .idle
    }
  }

  func retry() async {
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

private enum UITestingChatFixtures {
  static let recentConversationUserID = "user_ui_recent_conversations"
  static let recentConversationID = "conv_ui_recent_launch"
  static let recentConversationTitle = "Launch plan"
  static let cachedAssistantMessage = "Here is the cached launch plan."

  static func seedRecentConversationCache(cache: ChatCache = ChatCache()) async {
    let snapshot = CachedChatSnapshot(
      conversations: [
        MobileConversationSummary(
          id: recentConversationID,
          title: recentConversationTitle,
          createdAt: "2026-06-21T00:00:00.000Z",
          updatedAt: "2026-06-21T01:00:00.000Z",
          latestMessageRole: "assistant",
          latestTurnStatus: "completed"
        ),
      ],
      messagesByConversationID: [
        recentConversationID: [
          MobileConversationMessage(
            id: "msg_ui_recent_user",
            role: "user",
            content: "What should I ship next?",
            clientMessageId: "client_ui_recent_user",
            turnId: "turn_ui_recent",
            turnStatus: "completed",
            createdAt: "2026-06-21T00:59:00.000Z",
            requiresWebHandoff: false
          ),
          MobileConversationMessage(
            id: "msg_ui_recent_assistant",
            role: "assistant",
            content: cachedAssistantMessage,
            clientMessageId: nil,
            turnId: "turn_ui_recent",
            turnStatus: "completed",
            createdAt: "2026-06-21T01:00:00.000Z",
            requiresWebHandoff: false
          ),
        ],
      ],
      cachedAt: Date(timeIntervalSince1970: 1_782_017_600)
    )

    await cache.store(snapshot, for: recentConversationUserID)
  }
}
