import Foundation
import SwiftUI
import UIKit
import UserNotifications

protocol PushDeviceServicing: Sendable {
  func registerPushDevice(
    token: String, environment: IOSPushEnvironment, timezone: String,
    authorization: NativeRequestAuthorization
  ) async throws
  func unregisterPushDevice(token: String, authorization: NativeRequestAuthorization) async throws
}

extension APIClient: PushDeviceServicing {}

@MainActor
struct PushNotificationSystem {
  var authorizationStatus: @MainActor () async -> UNAuthorizationStatus
  var requestAuthorization: @MainActor () async throws -> Bool
  var register: @MainActor () -> Void
  var unregister: @MainActor () -> Void

  static var live: Self {
    Self(
      authorizationStatus: {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
      },
      requestAuthorization: {
        try await UNUserNotificationCenter.current().requestAuthorization(
          options: [.alert, .badge, .sound]
        )
      },
      register: { UIApplication.shared.registerForRemoteNotifications() },
      unregister: { UIApplication.shared.unregisterForRemoteNotifications() }
    )
  }
}

@MainActor
final class PushNotificationManager: PushNotificationCoordinating {
  static let shared = PushNotificationManager()

  private static let storedTokenKey = "jovie.apns.device-token"

  private var apiClient: (any PushDeviceServicing)?
  private var shouldRegister = false
  private var epoch = UUID()
  private var ownership: NativeSessionOwnership?
  private let system: PushNotificationSystem
  private let defaults: UserDefaults

  init(
    system: PushNotificationSystem? = nil,
    defaults: UserDefaults = .standard
  ) {
    self.system = system ?? .live
    self.defaults = defaults
  }

  func configure(apiClient: any PushDeviceServicing) {
    self.apiClient = apiClient
  }

  func activate() async {
    let context = NativeSessionTokenStore.captureSessionContext()
    let operation = UUID()
    epoch = operation
    ownership = context.ownership
    shouldRegister = true
    guard context.authorization != nil else {
      shouldRegister = false
      finishDeactivation(operation: operation, ownership: context.ownership)
      return
    }

    let status = await system.authorizationStatus()
    guard isCurrent(operation: operation, ownership: context.ownership) else { return }
    let isAuthorized: Bool

    switch status {
    case .notDetermined:
      isAuthorized = (try? await system.requestAuthorization()) == true
    case .authorized, .provisional, .ephemeral:
      isAuthorized = true
    case .denied:
      isAuthorized = false
    @unknown default:
      isAuthorized = false
    }

    guard isCurrent(operation: operation, ownership: context.ownership) else { return }
    guard isAuthorized else {
      await deactivate()
      return
    }

    system.register()
    if let token = defaults.string(forKey: Self.storedTokenKey) {
      await upload(token: token, operation: operation, ownership: context.ownership)
    }
  }

  func didRegister(deviceToken: Data) async {
    guard let ownership, NativeSessionTokenStore.isCurrent(ownership) else { return }
    guard shouldRegister else {
      system.unregister()
      return
    }
    let token = Self.tokenString(from: deviceToken)
    defaults.set(token, forKey: Self.storedTokenKey)
    await upload(token: token, operation: epoch, ownership: ownership)
  }

  func deactivate() async {
    let context = NativeSessionTokenStore.captureSessionContext()
    let operation = UUID()
    epoch = operation
    shouldRegister = false
    // An A-owned manager must not adopt B before B's activation has started.
    guard context.authorization == nil || ownership == nil || ownership == context.ownership else {
      return
    }
    ownership = context.ownership
    if let authorization = context.authorization,
       let token = defaults.string(forKey: Self.storedTokenKey), let apiClient
    {
      try? await apiClient.unregisterPushDevice(token: token, authorization: authorization)
    }
    finishDeactivation(operation: operation, ownership: context.ownership)
  }

  func deactivate(for claim: NativeSessionCleanupClaim) async {
    let operation = UUID()
    var accepted: NativeSessionContext?
    var token: String?
    NativeSessionTokenStore.performIfCurrent(claim) { context in
      guard context.authorization == nil || ownership == nil || ownership == context.ownership else { return }
      epoch = operation
      shouldRegister = false
      ownership = context.ownership
      token = defaults.string(forKey: Self.storedTokenKey)
      accepted = context
    }
    guard let accepted else { return }
    if let authorization = accepted.authorization, let token, let apiClient {
      try? await apiClient.unregisterPushDevice(token: token, authorization: authorization)
    }
    NativeSessionTokenStore.performIfCurrent(claim) { _ in
      // The store lock is already held: do not call isCurrent here.
      guard epoch == operation, ownership == accepted.ownership else { return }
      system.unregister()
      defaults.removeObject(forKey: Self.storedTokenKey)
    }
  }

  private func finishDeactivation(operation: UUID, ownership: NativeSessionOwnership) {
    guard isCurrent(operation: operation, ownership: ownership) else { return }
    system.unregister()
    defaults.removeObject(forKey: Self.storedTokenKey)
  }

  func deactivateLocally(ifOwnedBy ownership: NativeSessionOwnership) async {
    NativeSessionTokenStore.performIfCurrent(ownership) {
      epoch = UUID()
      self.ownership = ownership
      shouldRegister = false
      system.unregister()
      defaults.removeObject(forKey: Self.storedTokenKey)
    }
  }

  nonisolated static func tokenString(from data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
  }

  private func isCurrent(operation: UUID, ownership: NativeSessionOwnership) -> Bool {
    epoch == operation && self.ownership == ownership
      && NativeSessionTokenStore.isCurrent(ownership)
  }

  private func upload(token: String, operation: UUID, ownership: NativeSessionOwnership) async {
    guard shouldRegister, isCurrent(operation: operation, ownership: ownership), let apiClient,
          let authorization = NativeSessionTokenStore.requestAuthorization(ifOwnedBy: ownership)
    else { return }
#if DEBUG
    let environment = IOSPushEnvironment.sandbox
#else
    let environment = IOSPushEnvironment.production
#endif
    try? await apiClient.registerPushDevice(
      token: token,
      environment: environment,
      timezone: TimeZone.current.identifier,
      authorization: authorization
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
  @StateObject private var authCoordinator: MobileAuthCoordinator
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

    let state = AppState(
        configuration: configuration,
        launchMode: launchMode,
        repository: repository,
        brightnessManager: ScreenBrightnessManager(),
        pushNotifications: pushNotifications
      )
    _appState = State(initialValue: state)
    _authCoordinator = StateObject(wrappedValue: MobileAuthCoordinator(appState: state))
  }

  var body: some Scene {
    WindowGroup {
      Group {
#if DEBUG
        if appState.launchMode == .uiTestingAuthCallback {
          UITestingAuthCallbackRoot(appState: appState, authCoordinator: authCoordinator)
        } else if appState.launchMode.usesLiveAuth, isLiveAuthAvailable {
          LiveRootContainer(appState: appState, authCoordinator: authCoordinator)
        } else {
          RootView(
            appState: appState,
            isAuthAvailable: isLiveAuthAvailable,
            isSignInUnavailable: launchAuthErrorMessage != nil,
            authenticatedUserID: nil,
            authErrorMessage: launchAuthErrorMessage,
            authCoordinator: authCoordinator,
            onLogout: { authCoordinator.cancelCurrentAuth(); _ = await appState.signOut() }
          )
        }
#else
        if appState.launchMode.usesLiveAuth, isLiveAuthAvailable {
          LiveRootContainer(appState: appState, authCoordinator: authCoordinator)
        } else {
          RootView(
            appState: appState,
            isAuthAvailable: isLiveAuthAvailable,
            isSignInUnavailable: launchAuthErrorMessage != nil,
            authenticatedUserID: nil,
            authErrorMessage: launchAuthErrorMessage,
            authCoordinator: authCoordinator,
            onLogout: { authCoordinator.cancelCurrentAuth(); _ = await appState.signOut() }
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
