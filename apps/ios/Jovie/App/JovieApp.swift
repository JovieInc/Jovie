import Foundation
import SwiftUI
import UIKit

struct LiveLaunchConfiguration: Sendable {
  let configuration: AppConfiguration
  let shouldUseLiveAuth: Bool
  let authErrorMessage: String?
}

enum LiveLaunchConfigurationResolver {
  private static let unavailableMessage =
    "Sign-in is unavailable in this build. Install the latest TestFlight build or try again later."

  static func resolve(
    launchMode: LaunchMode,
    loadLiveConfiguration: () throws -> AppConfiguration = {
      try AppConfiguration.loadForLiveLaunch()
    },
    loadUnvalidatedConfiguration: () -> AppConfiguration = {
      AppConfiguration.load()
    }
  ) -> LiveLaunchConfiguration {
    guard launchMode.usesLiveAuth else {
      return LiveLaunchConfiguration(
        configuration: .mock,
        shouldUseLiveAuth: false,
        authErrorMessage: nil
      )
    }

    do {
      return LiveLaunchConfiguration(
        configuration: try loadLiveConfiguration(),
        shouldUseLiveAuth: true,
        authErrorMessage: nil
      )
    } catch {
      return LiveLaunchConfiguration(
        configuration: loadUnvalidatedConfiguration(),
        shouldUseLiveAuth: false,
        authErrorMessage: unavailableMessage
      )
    }
  }
}

@main
struct JovieApp: App {
  @UIApplicationDelegateAdaptor(JovieAppDelegate.self) private var appDelegate
  @State private var appState: AppState
  private let isLiveAuthAvailable: Bool
  private let launchAuthErrorMessage: String?

  init() {
    let launchMode = LaunchMode.current()
    let launchConfiguration = LiveLaunchConfigurationResolver.resolve(
      launchMode: launchMode
    )
    let configuration = launchConfiguration.configuration
    isLiveAuthAvailable = launchConfiguration.shouldUseLiveAuth
    launchAuthErrorMessage = launchConfiguration.authErrorMessage

    Observability.configure(
      environment: configuration.observabilityEnvironment,
      dsn: configuration.sentryDSN,
      ingestURL: configuration.observabilityIngestURL,
      ingestSecret: configuration.observabilityIngestSecret,
      isEnabled: launchMode == .live
    )
    Observability.setTag(key: "platform", value: "ios")
    Observability.setTag(
      key: "launch_mode",
      value: String(describing: launchMode)
    )

    let repository = MeRepository(
      apiClient: APIClient(
        baseURL: configuration.apiBaseURL,
        tokenProvider: NativeSessionTokenProvider()
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
#if DEBUG
        if appState.launchMode == .uiTestingAuthCallback {
          UITestingAuthCallbackRoot(appState: appState)
        } else if appState.launchMode.usesLiveAuth, isLiveAuthAvailable {
          LiveRootContainer(appState: appState)
        } else {
          RootView(
            appState: appState,
            isAuthAvailable: isLiveAuthAvailable,
            isSignInUnavailable: launchAuthErrorMessage != nil,
            authenticatedUserID: nil,
            authErrorMessage: launchAuthErrorMessage,
            onLogout: { await appState.signOut() },
            onAuthReturn: { _ in },
            onAuthError: { _ in }
          )
        }
#else
        if appState.launchMode.usesLiveAuth, isLiveAuthAvailable {
          LiveRootContainer(appState: appState)
        } else {
          RootView(
            appState: appState,
            isAuthAvailable: isLiveAuthAvailable,
            isSignInUnavailable: launchAuthErrorMessage != nil,
            authenticatedUserID: nil,
            authErrorMessage: launchAuthErrorMessage,
            onLogout: { await appState.signOut() },
            onAuthReturn: { _ in },
            onAuthError: { _ in }
          )
        }
#endif
      }
      .preferredColorScheme(.dark)
      .onOpenURL { url in
        // Better Auth returns the PKCE callback through Jovie's custom URL
        // scheme. The inbox covers callbacks received before the live root is
        // ready to consume them.
        MobileAuthCallbackURLInbox.shared.enqueue(url)
      }
      .task {
        await appState.completeLaunch()
      }
    }
  }
}

final class JovieAppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    Task { @MainActor in
      // Mirror of onOpenURL for universal links / external launches.
      // Mirror onOpenURL for callbacks delivered through the app delegate.
      MobileAuthCallbackURLInbox.shared.enqueue(url)
    }
    return true
  }
}
