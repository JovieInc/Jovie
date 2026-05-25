import ClerkKit
import Foundation
import Security
import SwiftUI
import UIKit

private struct NativeTicketSignInRequestMiddleware: ClerkRequestMiddleware {
  func prepare(_ request: inout URLRequest) async throws {
    if request.url?.path == "/v1/client/sign_ins",
       request.httpMethod?.uppercased() == "POST",
       let body = request.httpBody,
       let encodedBody = String(data: body, encoding: .utf8),
       encodedBody.contains("strategy=ticket")
    {
      request.setValue(nil, forHTTPHeaderField: "Authorization")
      request.setValue(nil, forHTTPHeaderField: "x-clerk-client-id")

#if DEBUG
      NativeTicketSignInDiagnostics.recordRequest(request)
#endif
      return
    }

    await NativeClerkDeviceTokenFallback.shared.apply(to: &request)
  }
}

private struct NativeTicketSignInResponseMiddleware: ClerkResponseMiddleware {
  func validate(_ response: HTTPURLResponse, data: Data, for request: URLRequest) async throws {
    switch (request.url?.path, request.httpMethod?.uppercased()) {
    case ("/v1/client/sign_ins", "POST"):
      try await NativeClerkDeviceTokenStore.persistDeviceToken(from: response)
      await NativeClerkDeviceTokenFallback.shared.save(
        deviceToken: response.value(forHTTPHeaderField: "Authorization"),
        clientID: NativeClerkResponseParser.clientID(from: data)
      )
#if DEBUG
      NativeTicketSignInDiagnostics.recordResponse(
        response,
        data: data,
        request: request,
        label: "signIn"
      )
#endif
    case ("/v1/client", "GET"):
      try await NativeClerkDeviceTokenStore.persistDeviceToken(from: response)
      await NativeClerkDeviceTokenFallback.shared.save(
        deviceToken: response.value(forHTTPHeaderField: "Authorization"),
        clientID: NativeClerkResponseParser.clientID(from: data)
      )
#if DEBUG
      NativeTicketSignInDiagnostics.recordResponse(
        response,
        data: data,
        request: request,
        label: "clientRefresh"
      )
#endif
    default:
      break
    }
  }
}

private actor NativeClerkDeviceTokenFallback {
  static let shared = NativeClerkDeviceTokenFallback()

  private var deviceToken: String?
  private var clientID: String?

  func save(deviceToken: String?, clientID: String?) {
    if let deviceToken, !deviceToken.isEmpty {
      self.deviceToken = deviceToken
    }

    if let clientID, !clientID.isEmpty {
      self.clientID = clientID
    }
  }

  func apply(to request: inout URLRequest) {
    guard request.url?.path.hasPrefix("/v1/client") == true else {
      return
    }

    if request.value(forHTTPHeaderField: "Authorization") == nil,
       let deviceToken
    {
      request.setValue(deviceToken, forHTTPHeaderField: "Authorization")
    }

    if request.value(forHTTPHeaderField: "x-clerk-client-id") == nil,
       let clientID
    {
      request.setValue(clientID, forHTTPHeaderField: "x-clerk-client-id")
    }
  }
}

private enum NativeClerkDeviceTokenStore {
  private static let service = "ie.jov.Jovie"
  private static let account = "clerkDeviceToken"

  static func persistDeviceToken(from response: HTTPURLResponse) async throws {
    guard let deviceToken = response.value(forHTTPHeaderField: "Authorization"),
          let data = deviceToken.data(using: .utf8)
    else {
      return
    }

    var addQuery = baseQuery()
    addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    addQuery[kSecValueData as String] = data

    let status = SecItemAdd(addQuery as CFDictionary, nil)
    switch status {
    case errSecSuccess:
      return
    case errSecDuplicateItem:
      let updateStatus = SecItemUpdate(
        baseQuery() as CFDictionary,
        [
          kSecValueData as String: data,
          kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ] as CFDictionary
      )

      guard updateStatus == errSecSuccess else {
        throw NativeClerkDeviceTokenStoreError.unexpectedStatus(updateStatus)
      }
    default:
#if targetEnvironment(simulator)
      if status == errSecMissingEntitlement {
        return
      }
#endif
      throw NativeClerkDeviceTokenStoreError.unexpectedStatus(status)
    }
  }

  private static func baseQuery() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}

private enum NativeClerkResponseParser {
  static func clientID(from data: Data) -> String? {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }

    if let client = object["client"] as? [String: Any],
       let clientID = client["id"] as? String
    {
      return clientID
    }

    if let response = object["response"] as? [String: Any],
       let clientID = response["id"] as? String,
       (response["object"] as? String) == "client"
    {
      return clientID
    }

    return nil
  }
}

private enum NativeClerkDeviceTokenStoreError: LocalizedError {
  case unexpectedStatus(OSStatus)

  var errorDescription: String? {
    switch self {
    case let .unexpectedStatus(status):
      "Failed to persist Clerk native device token. status=\(status)"
    }
  }
}

#if DEBUG
enum NativeTicketSignInDiagnostics {
  private static let summaryKey = "ie.jov.Jovie.nativeTicketSignInDiagnostics"

  static func summary() -> String? {
    UserDefaults.standard.string(forKey: summaryKey)
  }

  static func clear() {
    UserDefaults.standard.removeObject(forKey: summaryKey)
  }

  static func recordRequest(_ request: URLRequest) {
    let hasAuthorization = request.value(forHTTPHeaderField: "Authorization") != nil
    let hasClientID = request.value(forHTTPHeaderField: "x-clerk-client-id") != nil
    setSummary("requestMatched=true,requestAuth=\(hasAuthorization),requestClient=\(hasClientID)")
  }

  static func recordResponse(
    _ response: HTTPURLResponse,
    data: Data,
    request: URLRequest,
    label: String
  ) {
    let responseSummary = decodeResponseSummary(from: data)
    let hasAuthorization = response.value(forHTTPHeaderField: "Authorization") != nil
    let hasRequestAuthorization = request.value(forHTTPHeaderField: "Authorization") != nil
    let hasRequestClientID = request.value(forHTTPHeaderField: "x-clerk-client-id") != nil

    setSummary(
      [
        "label=\(label)",
        "requestMatched=true",
        "requestAuth=\(hasRequestAuthorization)",
        "requestClient=\(hasRequestClientID)",
        "status=\(response.statusCode)",
        "responseAuth=\(hasAuthorization)",
        responseSummary,
      ].joined(separator: ",")
    )
  }

  private static func decodeResponseSummary(from data: Data) -> String {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return "json=false"
    }

    let client = object["client"] as? [String: Any]
    let response = object["response"] as? [String: Any]
    let sessions = client?["sessions"] as? [Any]
    let lastActiveSessionID = client?["last_active_session_id"] as? String
    let createdSessionID = response?["created_session_id"] as? String
    let status = response?["status"] as? String

    return [
      "json=true",
      "client=\(client != nil)",
      "sessions=\(sessions?.count ?? -1)",
      "lastActive=\(lastActiveSessionID != nil)",
      "signInStatus=\(status ?? "nil")",
      "createdSession=\(createdSessionID != nil)",
    ].joined(separator: ",")
  }

  private static func setSummary(_ summary: String) {
    UserDefaults.standard.set(summary, forKey: summaryKey)
    UserDefaults.standard.synchronize()
  }
}
#endif

func makeJovieClerkOptions() -> Clerk.Options {
  let responseMiddleware: [any ClerkResponseMiddleware] = [
    NativeTicketSignInResponseMiddleware(),
  ]

  return Clerk.Options(
    keychainConfig: .init(service: "ie.jov.Jovie"),
    redirectConfig: .init(
      redirectUrl: "ie.jov.jovie://callback",
      callbackUrlScheme: "ie.jov.jovie"
    ),
    middleware: .init(
      request: [NativeTicketSignInRequestMiddleware()],
      response: responseMiddleware
    )
  )
}

@main
struct JovieApp: App {
  @UIApplicationDelegateAdaptor(JovieAppDelegate.self) private var appDelegate
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
        options: makeJovieClerkOptions()
      )
    }

    let repository = MeRepository(
      apiClient: APIClient(
        baseURL: configuration.apiBaseURL,
        tokenProvider: NativeSessionTokenProvider(fallback: ClerkTokenProvider())
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
        } else if appState.launchMode.usesLiveClerk {
          LiveRootContainer(appState: appState)
            .environment(Clerk.shared)
        } else {
          RootView(
            appState: appState,
            liveUserID: nil,
            authErrorMessage: nil,
            onLogout: { await appState.signOut() },
            onAuthReturn: { _ in },
            onAuthError: { _ in }
          )
        }
#else
        if appState.launchMode.usesLiveClerk {
          LiveRootContainer(appState: appState)
            .environment(Clerk.shared)
        } else {
          RootView(
            appState: appState,
            liveUserID: nil,
            authErrorMessage: nil,
            onLogout: { await appState.signOut() },
            onAuthReturn: { _ in },
            onAuthError: { _ in }
          )
        }
#endif
      }
      .preferredColorScheme(.dark)
      .onOpenURL { url in
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
      MobileAuthCallbackURLInbox.shared.enqueue(url)
    }
    return true
  }
}
