import Foundation
import SwiftUI
import UIKit
import UserNotifications

@MainActor
final class PushNotificationManager: PushNotificationCoordinating {
  static let shared = PushNotificationManager()

  private static let storedTokenKey = "jovie.apns.device-token"

  private var apiClient: APIClient?
  private var shouldRegister = false
  private let notificationCenter: UNUserNotificationCenter
  private let defaults: UserDefaults

  private init(
    notificationCenter: UNUserNotificationCenter = .current(),
    defaults: UserDefaults = .standard
  ) {
    self.notificationCenter = notificationCenter
    self.defaults = defaults
  }

  func configure(apiClient: APIClient) {
    self.apiClient = apiClient
  }

  func activate() async {
    shouldRegister = true
    let settings = await notificationCenter.notificationSettings()
    let isAuthorized: Bool

    switch settings.authorizationStatus {
    case .notDetermined:
      isAuthorized = (try? await notificationCenter.requestAuthorization(
        options: [.alert, .badge, .sound]
      )) == true
    case .authorized, .provisional, .ephemeral:
      isAuthorized = true
    case .denied:
      isAuthorized = false
    @unknown default:
      isAuthorized = false
    }

    guard shouldRegister, isAuthorized else {
      await deactivate()
      return
    }

    UIApplication.shared.registerForRemoteNotifications()
    if let token = defaults.string(forKey: Self.storedTokenKey) {
      await upload(token: token)
    }
  }

  func didRegister(deviceToken: Data) async {
    guard shouldRegister else {
      UIApplication.shared.unregisterForRemoteNotifications()
      return
    }
    let token = Self.tokenString(from: deviceToken)
    defaults.set(token, forKey: Self.storedTokenKey)
    await upload(token: token)
  }

  func deactivate() async {
    shouldRegister = false
    if let token = defaults.string(forKey: Self.storedTokenKey), let apiClient {
      try? await apiClient.unregisterPushDevice(token: token)
    }
    UIApplication.shared.unregisterForRemoteNotifications()
    defaults.removeObject(forKey: Self.storedTokenKey)
  }

  static func tokenString(from data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
  }

  private func upload(token: String) async {
    guard shouldRegister, let apiClient else { return }
#if DEBUG
    let environment = IOSPushEnvironment.sandbox
#else
    let environment = IOSPushEnvironment.production
#endif
    try? await apiClient.registerPushDevice(
      token: token,
      environment: environment,
      timezone: TimeZone.current.identifier
    )
  }
}

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

    let apiClient = APIClient(
      baseURL: configuration.apiBaseURL,
      tokenProvider: NativeSessionTokenProvider()
    )
    let repository = MeRepository(apiClient: apiClient, cache: MeCache())
    let pushNotifications = PushNotificationManager.shared
    pushNotifications.configure(apiClient: apiClient)

    _appState = State(
      initialValue: AppState(
        configuration: configuration,
        launchMode: launchMode,
        repository: repository,
        brightnessManager: ScreenBrightnessManager(),
        pushNotifications: pushNotifications
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

final class JovieAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  func application(
    _: UIApplication,
    didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return true
  }

  func application(
    _: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Task { @MainActor in
      await PushNotificationManager.shared.didRegister(deviceToken: deviceToken)
    }
  }

  func application(
    _: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    MobileAuthDiagnostics.record(
      "apns_registration_failed",
      detail: String(describing: error)
    )
  }

  func userNotificationCenter(
    _: UNUserNotificationCenter,
    willPresent _: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound, .badge])
  }

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
