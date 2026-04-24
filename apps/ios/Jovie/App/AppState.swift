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
    case .uiTestingReady:
      route = .ready
      dashboardState = .loaded(.previewReady)
      isOffline = false
    case .uiTestingNeedsOnboarding:
      route = .needsOnboarding
      dashboardState = .idle
      isOffline = false
    }
  }

  func handleSignedInUserChange(_ userID: String?) async {
    guard launchMode.usesLiveClerk, didLoadClerk else { return }

    activeUserID = userID

    guard let userID else {
      route = .signedOut
      dashboardState = .idle
      isOffline = false
      return
    }

    route = .launching
    dashboardState = .loading
    isOffline = false

    do {
      let result = try await repository.loadMe(for: userID)
      isOffline = result.isStale

      switch result.response.state {
      case .ready:
        route = .ready
        dashboardState = .loaded(result.response)
      case .needsOnboarding:
        route = .needsOnboarding
        dashboardState = .idle
      }
    } catch {
      if let error = error as? APIClientError {
        switch error {
        case .missingToken, .requestFailed(statusCode: 401):
          route = .signedOut
          dashboardState = .idle
          isOffline = false
          return
        case .invalidResponse, .requestFailed:
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

  var continueOnWebURL: URL {
    switch dashboardState {
    case let .loaded(response):
      return URL(string: response.continueOnWebURL) ?? configuration.webBaseURL
    case .idle, .loading, .error:
      return configuration.webBaseURL.appending(path: "app")
    }
  }
}
