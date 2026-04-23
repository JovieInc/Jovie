import ClerkKit
import SwiftUI

@main
struct JovieApp: App {
  @State private var appState: AppState

  init() {
    let launchMode = LaunchMode.current()
    let configuration = launchMode.usesLiveClerk ? AppConfiguration.load() : .mock

    if launchMode.usesLiveClerk {
      Clerk.configure(
        publishableKey: configuration.clerkPublishableKey,
        options: Clerk.Options(
          keychainConfig: .init(service: "ie.jov.Jovie"),
          redirectConfig: .init(
            redirectUrl: "ie.jov.Jovie://callback",
            callbackUrlScheme: "ie.jov.Jovie"
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
          RootView(appState: appState, liveUserID: nil)
        }
      }
      .preferredColorScheme(.dark)
      .task {
        await appState.completeLaunch()
      }
    }
  }
}
