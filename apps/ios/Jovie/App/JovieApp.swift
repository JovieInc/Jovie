import ClerkKit
import Foundation
import SwiftUI
import UIKit

struct LiveLaunchConfiguration: Sendable {
  let configuration: AppConfiguration
  let shouldConfigureClerk: Bool
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
    guard launchMode.usesLiveClerk else {
      return LiveLaunchConfiguration(
        configuration: .mock,
        shouldConfigureClerk: false,
        authErrorMessage: nil
      )
    }

    do {
      return LiveLaunchConfiguration(
        configuration: try loadLiveConfiguration(),
        shouldConfigureClerk: true,
        authErrorMessage: nil
      )
    } catch {
      return LiveLaunchConfiguration(
        configuration: loadUnvalidatedConfiguration(),
        shouldConfigureClerk: false,
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
    isLiveAuthAvailable = launchConfiguration.shouldConfigureClerk
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

    if launchConfiguration.shouldConfigureClerk {
      // Better Auth migration: no client-side Clerk publishable key — the
      // native handoff uses OTT + deep-link callback scheme only. Clerk SDK
      // is configured with an empty key so its singleton stays initialized
      // for the remaining sign-out paths during the cutover.
      Clerk.configure(
        publishableKey: "",
        options: makeJovieClerkOptions(
          redirectUrl: "ie.jov.jovie://callback",
          callbackUrlScheme: configuration.clerkCallbackUrlScheme,
          keychainService: launchMode.clerkKeychainService
        )
      )

      if launchMode.clearsStoredClerkSession {
        Clerk.clearAllKeychainItems()
      }
    }

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
        } else if appState.launchMode.usesLiveClerk, isLiveAuthAvailable {
          LiveRootContainer(appState: appState)
            .environment(Clerk.shared)
        } else {
          RootView(
            appState: appState,
            isAuthAvailable: isLiveAuthAvailable,
            isSignInUnavailable: launchAuthErrorMessage != nil,
            liveUserID: nil,
            authErrorMessage: launchAuthErrorMessage,
            onLogout: { await appState.signOut() },
            onAuthReturn: { _ in },
            onAuthError: { _ in }
          )
        }
#else
        if appState.launchMode.usesLiveClerk, isLiveAuthAvailable {
          LiveRootContainer(appState: appState)
            .environment(Clerk.shared)
        } else {
          RootView(
            appState: appState,
            isAuthAvailable: isLiveAuthAvailable,
            isSignInUnavailable: launchAuthErrorMessage != nil,
            liveUserID: nil,
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
        // Jovie native auth callbacks + Clerk SDK redirects (configured via
        // AppConfiguration.clerkRedirectUrl from env/plist, gh-9806/JOV-2652).
        // Clerk dashboard must whitelist the exact redirectUrl for the key.
        // If ClerkKit exposes handle (e.g. Clerk.shared.handle(url:)), forward
        // matching Clerk callbacks here for full SDK redirect support.
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
      // See above for Clerk iOS auth config notes (HOT ZONE).
      MobileAuthCallbackURLInbox.shared.enqueue(url)
    }
    return true
  }
}
