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
    case .live, .uiTestingAutoAuth, .uiTestingLiveAuth:
      didLoadClerk = true
    case .unitTesting:
      route = .signedOut
      dashboardState = .idle
      isOffline = false
    case .uiTestingSignedOut:
      route = .signedOut
      dashboardState = .idle
    case .uiTestingReady, .uiTestingChat, .uiTestingSettings, .uiTestingVenueMode:
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
      return
    }

    Observability.setUser(id: userID)
    loadingUserID = userID
    defer {
      if loadingUserID == userID {
        loadingUserID = nil
      }
    }

    route = .launching
    dashboardState = .loading
    isOffline = false

    do {
      let result = try await repository.loadMe(for: userID)
      guard activeUserID == userID, loadingUserID == userID else { return }
      isOffline = result.isStale

      switch result.response.state {
      case .ready:
        route = .ready
        dashboardState = .loaded(result.response)
        Observability.addBreadcrumb(
          .appRouteAfterLogin,
          context: ["route": "ready"]
        )
      case .needsOnboarding:
        route = .needsOnboarding
        dashboardState = .idle
        Observability.addBreadcrumb(
          .appRouteAfterLogin,
          context: ["route": "needs_onboarding"]
        )
      }
    } catch {
      guard activeUserID == userID, loadingUserID == userID else { return }

      if let error = error as? APIClientError {
        switch error {
        case .missingToken, .requestFailed(statusCode: 401):
          Observability.clearUser()
          route = .signedOut
          dashboardState = .idle
          isOffline = false
          return
        case .decodingFailed, .invalidResponse, .transportFailed, .requestFailed:
          break
        }
      }

      route = .ready
      dashboardState = .error("Couldn't load your profile.")
      isOffline = false
    }
  }

  func retry() async {
    await handleSignedInUserChange(activeUserID)
  }

  func signOut() async {
    let userID = activeUserID
    Observability.clearUser()
    activeUserID = nil
    loadingUserID = nil
    route = .signedOut
    dashboardState = .idle
    isOffline = false

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
