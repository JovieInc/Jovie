import AuthenticationServices
import CryptoKit
import OSLog
import Security
import SwiftUI
import UIKit

private let authLogger = Logger(
  subsystem: Bundle.main.bundleIdentifier ?? "ie.jov.Jovie",
  category: "Auth"
)

struct AuthScreen: View {
  let isMock: Bool
  let webBaseURL: URL
  let errorMessage: String?
  let onAuthReturn: @MainActor (MobileAuthReturn) -> Void

  @State private var authCoordinator = MobileAuthCoordinator()
  @State private var didRequestBrowserAuth = false

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(spacing: 0) {
        Spacer(minLength: 96)

        VStack(spacing: JovieSpacing.xLarge) {
          JovieLogoMark(size: 92)
            .accessibilityIdentifier("auth-jovie-logo")

          Text("Sign in to Jovie")
            .font(JovieFont.display(size: 29, weight: .semibold))
            .foregroundStyle(JovieColor.textPrimary)
            .multilineTextAlignment(.center)
            .minimumScaleFactor(0.86)
        }
        .frame(maxWidth: 360)
        .padding(.horizontal, JovieSpacing.xLarge)

        Spacer(minLength: 72)

        BrowserAuthActions(
          isOpening: didRequestBrowserAuth,
          errorMessage: errorMessage,
          action: startBrowserAuth
        )
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .accessibilityIdentifier("auth-screen")
  }

  private func startBrowserAuth() {
    guard !isMock else {
      return
    }

    didRequestBrowserAuth = true

    authCoordinator.startSignIn(baseURL: webBaseURL) { result in
      Task { @MainActor in
        didRequestBrowserAuth = false

        switch result {
        case let .success(authReturn):
          onAuthReturn(authReturn)
        case let .failure(error):
          if error is CancellationError {
            return
          }

          authLogger.error("Mobile browser auth failed: \(error.localizedDescription, privacy: .public)")
        }
      }
    }
  }
}

enum MobileBrowserAuthURLBuilder {
  static func signInURL(
    baseURL: URL,
    returnRoute: String = "/app",
    codeChallenge: String
  ) -> URL? {
    let safeReturnRoute = sanitizeReturnRoute(returnRoute) ?? "/app"
    guard var components = URLComponents(
      url: baseURL.appending(path: "auth/start"),
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
}

@MainActor
final class MobileAuthCoordinator: NSObject, ASWebAuthenticationPresentationContextProviding {
  private var session: ASWebAuthenticationSession?

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
      completion(.failure(MobileAuthCoordinatorError.invalidAuthURL))
      return
    }

    let session = ASWebAuthenticationSession(
      url: authURL,
      callbackURLScheme: "ie.jov.jovie"
    ) { callbackURL, error in
      Task { @MainActor in
        self.session = nil

        if let error {
          completion(.failure(error))
          return
        }

        guard let callbackURL,
              let authReturn = MobileAuthReturnParser.parse(
                callbackURL,
                codeVerifier: codeVerifier
              )
        else {
          completion(.failure(MobileAuthCoordinatorError.missingCallbackURL))
          return
        }

        completion(.success(authReturn))
      }
    }

    session.presentationContextProvider = self
    session.prefersEphemeralWebBrowserSession = false
    self.session = session

    if !session.start() {
      self.session = nil
      completion(.failure(MobileAuthCoordinatorError.invalidAuthURL))
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

private extension Data {
  func base64URLEncodedString() -> String {
    base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

private struct BrowserAuthActions: View {
  let isOpening: Bool
  let errorMessage: String?
  let action: () -> Void

  var body: some View {
    VStack(spacing: JovieSpacing.large) {
      GetStartedButton(isOpening: isOpening, action: action)

      AuthErrorText(message: errorMessage)
    }
    .frame(maxWidth: 430)
    .padding(.horizontal, JovieSpacing.xLarge)
    .padding(.bottom, JovieSpacing.xxLarge)
  }
}

private struct GetStartedButton: View {
  let isOpening: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.small) {
        if isOpening {
          ProgressView()
            .controlSize(.small)
            .tint(JovieColor.backgroundBase)
        }

        Text(isOpening ? "Opening..." : "Get started")
          .lineLimit(1)
          .minimumScaleFactor(0.82)
      }
      .font(JovieFont.body(size: 16, weight: .semibold))
      .foregroundStyle(JovieColor.backgroundBase)
      .frame(maxWidth: .infinity)
      .frame(height: 56)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .background(
      Capsule(style: .continuous)
        .fill(Color.white)
    )
    .accessibilityIdentifier("auth-get-started-button")
  }
}

private struct AuthErrorText: View {
  let message: String?

  var body: some View {
    Text(message ?? " ")
      .font(JovieFont.body(size: 13, weight: .medium))
      .foregroundStyle(JovieColor.errorText)
      .multilineTextAlignment(.center)
      .fixedSize(horizontal: false, vertical: true)
      .frame(minHeight: 36)
      .frame(maxWidth: .infinity)
      .accessibilityHidden(message == nil)
  }
}
