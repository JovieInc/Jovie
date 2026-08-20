import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

enum MobileBrowserAuthURLBuilder {
  static func signInURL(
    baseURL: URL,
    returnRoute: String = "/app",
    codeChallenge: String,
    processInfo: ProcessInfo = .processInfo
  ) -> URL? {
    let safeReturnRoute = sanitizeReturnRoute(returnRoute) ?? "/app"
    let isRealBrowserAuthTest =
      processInfo.arguments.contains("-ui-testing-real-browser-auth") ||
      processInfo.environment["JOVIE_IOS_REAL_BROWSER_AUTH"] == "1"
    let authPath = isRealBrowserAuthTest
      ? (processInfo.environment["JOVIE_IOS_REAL_BROWSER_AUTH_PATH"]?
          .trimmingCharacters(in: .whitespacesAndNewlines)
          .nilIfEmpty ?? "api/dev/test-auth/mobile-provider-complete")
      : "auth/start"

    if isRealBrowserAuthTest, baseURL.scheme?.lowercased() != "https" {
      MobileAuthDiagnostics.record(
        "auth_url_rejected",
        detail: "real browser auth requires HTTPS"
      )
      return nil
    }

    guard isSupportedBrowserAuthURL(baseURL) else {
      MobileAuthDiagnostics.record(
        "auth_url_rejected",
        detail: "browser auth requires https or localhost http"
      )
      return nil
    }

    guard var components = URLComponents(
      url: baseURL.appending(path: authPath),
      resolvingAgainstBaseURL: false
    ) else {
      return nil
    }

    components.queryItems = [
      URLQueryItem(name: "client", value: "ios"),
      URLQueryItem(name: "intent", value: "sign_in"),
      URLQueryItem(name: "return_to", value: safeReturnRoute),
      URLQueryItem(name: "code_challenge", value: codeChallenge),
      URLQueryItem(name: "code_challenge_method", value: "S256"),
    ]

    if isRealBrowserAuthTest {
      components.queryItems?.append(
        URLQueryItem(
          name: "persona",
          value: processInfo.environment["JOVIE_IOS_REAL_BROWSER_AUTH_PERSONA"] ?? "creator-ready"
        )
      )

      if let testToken = processInfo.environment["JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN"]?
        .trimmingCharacters(in: .whitespacesAndNewlines),
         !testToken.isEmpty
      {
        components.queryItems?.append(URLQueryItem(name: "test_token", value: testToken))
      }
    }

    guard let url = components.url, isSupportedBrowserAuthURL(url) else {
      return nil
    }

    return url
  }

  static func isSupportedBrowserAuthURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(),
          let host = url.host?.lowercased(),
          !host.isEmpty
    else {
      return false
    }

    if scheme == "https" {
      return true
    }

    if scheme == "http" {
      return host == "localhost"
        || host == "127.0.0.1"
        || host == "::1"
        || host.hasSuffix(".localhost")
    }

    return false
  }

  private static func sanitizeReturnRoute(_ route: String) -> String? {
    let trimmed = route.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.starts(with: "/"),
          !trimmed.starts(with: "//"),
          !trimmed.contains("://"),
          !trimmed.contains("\\")
    else {
      return nil
    }

    guard let components = URLComponents(string: trimmed),
          components.scheme == nil,
          components.host == nil
    else {
      return nil
    }

    return trimmed
  }
}

enum MobileAuthCoordinatorError: Error, CustomNSError {
  case invalidAuthURL
  case sessionStartFailed
  case missingCallbackURL
  case providerError(MobileAuthProviderError)

  static var errorDomain: String { "Jovie.MobileAuthCoordinatorError" }

  var errorCode: Int {
    switch self {
    case .invalidAuthURL:
      return 1
    case .sessionStartFailed:
      return 2
    case .missingCallbackURL:
      return 3
    case .providerError:
      return 4
    }
  }
}

struct MobileAuthWindowSnapshot: Equatable {
  let isKey: Bool
  let isHidden: Bool
}

enum MobileAuthPresentationAnchor {
  static func preferredWindowIndex(
    in windows: [MobileAuthWindowSnapshot]
  ) -> Int? {
    if let keyIndex = windows.firstIndex(where: \.isKey) {
      return keyIndex
    }

    return windows.firstIndex { !$0.isHidden }
  }

  static func current() -> ASPresentationAnchor? {
    let scenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap(\.windows)
    let snapshots = windows.map {
      MobileAuthWindowSnapshot(isKey: $0.isKeyWindow, isHidden: $0.isHidden)
    }

    if let index = preferredWindowIndex(in: snapshots) {
      return windows[index]
    }

    let fallbackScene = scenes.first { $0.activationState == .foregroundActive }
      ?? scenes.first { $0.activationState == .foregroundInactive }
      ?? scenes.first
    guard let fallbackScene else {
      return nil
    }

    if let sceneWindow = fallbackScene.windows.first {
      return sceneWindow
    }

    return ASPresentationAnchor(windowScene: fallbackScene)
  }
}

struct MobileAuthPresentationWindowCandidate: Equatable {
  let isForegroundActive: Bool
  let isKeyWindow: Bool
}

enum MobileAuthPresentationWindowSelector {
  static func selectedIndex(
    from candidates: [MobileAuthPresentationWindowCandidate]
  ) -> Int? {
    let activeIndices = candidates.indices.filter { candidates[$0].isForegroundActive }
    if let keyIndex = activeIndices.first(where: { candidates[$0].isKeyWindow }) {
      return keyIndex
    }
    return activeIndices.first
  }
}

enum MobileAuthPresentationContextRetryPolicy {
  static let maxAttempts = 2

  static func shouldRetry(error: Error, attempt: Int) -> Bool {
    attempt < maxAttempts && isAuthSessionPresentationContextInvalid(error)
  }
}

@MainActor
enum MobileAuthPresentationWindows {
  static func selectedWindow(
    from application: UIApplication = .shared
  ) -> UIWindow? {
    let windows = attachedWindows(from: application)
    let candidates = windows.map { window in
      MobileAuthPresentationWindowCandidate(
        isForegroundActive: window.windowScene?.activationState == .foregroundActive,
        isKeyWindow: window.isKeyWindow
      )
    }
    guard let index = MobileAuthPresentationWindowSelector.selectedIndex(from: candidates) else {
      return nil
    }
    return windows[index]
  }

  static func attachedWindows(from application: UIApplication = .shared) -> [UIWindow] {
    application.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
  }
}

@MainActor
final class MobileAuthCoordinator: NSObject, ASWebAuthenticationPresentationContextProviding {
  private let pendingStore: MobileAuthPendingStore
  private var session: ASWebAuthenticationSession?

  override init() {
    self.pendingStore = MobileAuthPendingStore.shared
    super.init()
  }

  init(pendingStore: MobileAuthPendingStore) {
    self.pendingStore = pendingStore
    super.init()
  }

  func startSignIn(
    baseURL: URL,
    completion: @escaping (Result<MobileAuthReturn, Error>) -> Void
  ) {
    let codeVerifier = Self.makeCodeVerifier()
    let codeChallenge = Self.makeCodeChallenge(verifier: codeVerifier)

    guard let authURL = MobileBrowserAuthURLBuilder.signInURL(
      baseURL: baseURL,
      codeChallenge: codeChallenge
    ) else {
      Observability.addBreadcrumb(
        .authSessionClosed,
        level: .warning,
        context: ["reason": "invalid_auth_url"]
      )
      MobileAuthDiagnostics.record("auth_url_invalid")
      completion(.failure(MobileAuthCoordinatorError.invalidAuthURL))
      return
    }

    pendingStore.save(codeVerifier: codeVerifier)
    Task { @MainActor in
      await self.startAuthenticationSession(
        authURL: authURL,
        codeVerifier: codeVerifier,
        attempt: 1,
        completion: completion
      )
    }
  }

  private func startAuthenticationSession(
    authURL: URL,
    codeVerifier: String,
    attempt: Int,
    completion: @escaping (Result<MobileAuthReturn, Error>) -> Void
  ) async {
    await Self.waitForForegroundActivePresentationWindow()

    Observability.addBreadcrumb(
      .authSheetOpened,
      context: [
        "auth_url": authURL,
        "attempt": attempt,
      ]
    )
    MobileAuthDiagnostics.record(
      attempt == 1 ? "auth_session_opening" : "auth_session_presentation_retry",
      detail: "\(authURL.host ?? "unknown")\(authURL.path)"
    )

    let session = ASWebAuthenticationSession(
      url: authURL,
      callback: .customScheme("ie.jov.jovie")
    ) { callbackURL, error in
      Task { @MainActor in
        self.session = nil

        if let error {
          if MobileAuthPresentationContextRetryPolicy.shouldRetry(
            error: error,
            attempt: attempt
          ) {
            Observability.addBreadcrumb(
              .authSessionClosed,
              level: .warning,
              context: [
                "reason": "presentation_context_invalid_retry",
                "attempt": attempt,
              ]
            )
            MobileAuthDiagnostics.record(
              "auth_session_presentation_retry",
              detail: error.localizedDescription
            )
            await self.startAuthenticationSession(
              authURL: authURL,
              codeVerifier: codeVerifier,
              attempt: attempt + 1,
              completion: completion
            )
            return
          }

          Observability.addBreadcrumb(
            .authSessionClosed,
            context: [
              "reason": "session_error",
              "error_type": String(describing: type(of: error)),
            ]
          )
          self.pendingStore.clear()
          MobileAuthDiagnostics.record("auth_session_error", detail: error.localizedDescription)
          completion(.failure(error))
          return
        }

        guard let callbackURL else {
          Observability.addBreadcrumb(
            .deepLinkParseFailed,
            level: .warning,
            context: ["reason": "missing_callback_url"]
          )
          self.pendingStore.clear()
          MobileAuthDiagnostics.record("auth_callback_missing")
          completion(.failure(MobileAuthCoordinatorError.missingCallbackURL))
          return
        }

        Observability.addBreadcrumb(
          .authCallbackReceived,
          context: ["callback_url": callbackURL]
        )
        MobileAuthDiagnostics.record(
          "auth_callback_received",
          detail: "\(callbackURL.scheme ?? "unknown")://\(callbackURL.host ?? "unknown")\(callbackURL.path)"
        )

        if let providerError = MobileAuthReturnParser.parseProviderError(callbackURL) {
          self.pendingStore.clear()
          Observability.addBreadcrumb(
            .deepLinkParseFailed,
            level: .warning,
            context: [
              "reason": "provider_error",
              "error": providerError.error,
            ]
          )
          MobileAuthDiagnostics.record("auth_callback_provider_error", detail: providerError.error)
          completion(.failure(MobileAuthCoordinatorError.providerError(providerError)))
          return
        }

        guard let authReturn = MobileAuthReturnParser.parse(
          callbackURL,
          codeVerifier: codeVerifier
        ) else {
          Observability.addBreadcrumb(
            .deepLinkParseFailed,
            level: .warning,
            context: ["reason": "missing_or_invalid_callback_url"]
          )
          self.pendingStore.clear()
          MobileAuthDiagnostics.record("auth_callback_parse_failed")
          completion(.failure(MobileAuthCoordinatorError.missingCallbackURL))
          return
        }

        Observability.addBreadcrumb(
          .authCallbackURLParsed,
          context: ["callback_url": callbackURL]
        )
        MobileAuthDiagnostics.record("auth_callback_parsed")
        completion(.success(authReturn))
      }
    }

    session.presentationContextProvider = self
    session.prefersEphemeralWebBrowserSession = false
    self.session = session

    guard MobileAuthPresentationAnchor.current() != nil else {
      self.session = nil
      Observability.addBreadcrumb(
        .authSessionClosed,
        level: .warning,
        context: ["reason": "missing_presentation_anchor"]
      )
      pendingStore.clear()
      MobileAuthDiagnostics.record(
        "auth_session_start_failed",
        detail: "missing_presentation_anchor"
      )
      completion(.failure(MobileAuthCoordinatorError.sessionStartFailed))
      return
    }

    if !session.start() {
      self.session = nil
      Observability.addBreadcrumb(
        .authSessionClosed,
        level: .warning,
        context: ["reason": "session_start_failed"]
      )
      pendingStore.clear()
      MobileAuthDiagnostics.record("auth_session_start_failed")
      completion(.failure(MobileAuthCoordinatorError.sessionStartFailed))
    } else {
      MobileAuthDiagnostics.record("auth_session_opened")
    }
  }

  func presentationAnchor(
    for session: ASWebAuthenticationSession
  ) -> ASPresentationAnchor {
    if let window = MobileAuthPresentationWindows.selectedWindow() {
      return window
    }

    // Prefer any scene-attached window over a detached dummy window. ASWebAuthenticationSession
    // Code 3 fires when the returned window's scene is missing or not foreground-active.
    if let window = MobileAuthPresentationWindows.attachedWindows().first {
      return window
    }

    return MobileAuthPresentationAnchor.current() ?? ASPresentationAnchor()
  }

  private static func waitForForegroundActivePresentationWindow() async {
    if MobileAuthPresentationWindows.selectedWindow() != nil {
      return
    }

    for _ in 0..<40 {
      try? await Task.sleep(for: .milliseconds(50))
      if Task.isCancelled {
        return
      }
      if MobileAuthPresentationWindows.selectedWindow() != nil {
        return
      }
    }
  }

  private static func makeCodeVerifier() -> String {
    var bytes = [UInt8](repeating: 0, count: 64)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    return Data(bytes).base64URLEncodedString()
  }

  private static func makeCodeChallenge(verifier: String) -> String {
    let digest = SHA256.hash(data: Data(verifier.utf8))
    return Data(digest).base64URLEncodedString()
  }
}

func isAuthSessionCancellation(_ error: Error) -> Bool {
  if error is CancellationError {
    return true
  }

  if let error = error as? ASWebAuthenticationSessionError {
    return error.code == .canceledLogin
  }

  return false
}

func isAuthSessionPresentationContextInvalid(_ error: Error) -> Bool {
  if let error = error as? ASWebAuthenticationSessionError {
    return error.code == .presentationContextInvalid
  }

  let nsError = error as NSError
  return nsError.domain == ASWebAuthenticationSessionErrorDomain
    && nsError.code == ASWebAuthenticationSessionError.Code.presentationContextInvalid.rawValue
}

private extension String {
  var nilIfEmpty: String? {
    isEmpty ? nil : self
  }
}

private extension Data {
  func base64URLEncodedString() -> String {
    base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
