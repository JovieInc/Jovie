import ClerkKit
import SwiftUI

@main
struct JovieApp: App {
  @State private var appState: AppState

  init() {
    let launchMode = LaunchMode.current()
    let configuration = launchMode.usesLiveClerk ? AppConfiguration.load() : .mock

    Observability.configure(
      environment: configuration.observabilityEnvironment,
      dsn: configuration.sentryDSN,
      isEnabled: launchMode == .live
    )
    Observability.setTag(key: "platform", value: "ios")
    Observability.setTag(
      key: "launch_mode",
      value: String(describing: launchMode)
    )

    if launchMode.usesLiveClerk {
      Clerk.configure(
        publishableKey: configuration.clerkPublishableKey,
        options: Clerk.Options(
          keychainConfig: .init(service: "ie.jov.Jovie"),
          redirectConfig: .init(
            redirectUrl: "ie.jov.jovie://callback",
            callbackUrlScheme: "ie.jov.jovie"
          )
        )
      )
    }

    let repository = MeRepository(
      apiClient: APIClient(
        baseURL: configuration.apiBaseURL,
        tokenProvider: ClerkTokenProvider()
      ),
      cache: MeCache()
    )

    _appState = State(
      initialValue: AppState(
        configuration: configuration,
        launchMode: launchMode,
        repository: repository,
        brightnessManager: ScreenBrightnessManager()
      )
    )
  }

  var body: some Scene {
    WindowGroup {
      Group {
        if appState.launchMode.usesLiveClerk {
          LiveRootContainer(appState: appState)
            .environment(Clerk.shared)
        } else {
          RootView(
            appState: appState,
            liveUserID: nil,
            authErrorMessage: nil,
            onLogout: { await appState.signOut() },
            onAuthReturn: { _ in }
          )
        }
      }
      .preferredColorScheme(.dark)
      .task {
        await appState.completeLaunch()
      }
    }
  }
}
