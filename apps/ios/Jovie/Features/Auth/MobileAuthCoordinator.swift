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

    return components.url
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

enum MobileAuthCoordinatorError: Error {
  case invalidAuthURL
  case missingCallbackURL
  case providerError(MobileAuthProviderError)
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
    Observability.addBreadcrumb(
      .authSheetOpened,
      context: ["auth_url": authURL]
    )
    MobileAuthDiagnostics.record(
      "auth_session_opening",
      detail: "\(authURL.host ?? "unknown")\(authURL.path)"
    )

    let session = ASWebAuthenticationSession(
      url: authURL,
      callbackURLScheme: "ie.jov.jovie"
    ) { callbackURL, error in
      Task { @MainActor in
        self.session = nil

        if let error {
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
        self.pendingStore.clear()
        MobileAuthDiagnostics.record("auth_callback_parsed")
        completion(.success(authReturn))
      }
    }

    session.presentationContextProvider = self
    session.prefersEphemeralWebBrowserSession = false
    self.session = session

    if !session.start() {
      self.session = nil
      Observability.addBreadcrumb(
        .authSessionClosed,
        level: .warning,
        context: ["reason": "session_start_failed"]
      )
      pendingStore.clear()
      MobileAuthDiagnostics.record("auth_session_start_failed")
      completion(.failure(MobileAuthCoordinatorError.invalidAuthURL))
    } else {
      MobileAuthDiagnostics.record("auth_session_opened")
    }
  }

  func presentationAnchor(
    for session: ASWebAuthenticationSession
  ) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow } ?? ASPresentationAnchor()
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
