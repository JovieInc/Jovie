import OSLog
import SwiftUI

private let authLogger = Logger(
  subsystem: Bundle.main.bundleIdentifier ?? "ie.jov.Jovie",
  category: "Auth"
)

struct AuthScreen: View {
  let isMock: Bool
  let webBaseURL: URL
  let errorMessage: String?

  @Environment(\.openURL) private var openURL
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
    guard !isMock,
          let authURL = MobileBrowserAuthURLBuilder.signInURL(baseURL: webBaseURL)
    else {
      return
    }

    didRequestBrowserAuth = true

    openURL(authURL) { accepted in
      if !accepted {
        authLogger.error("System refused to open mobile browser auth URL.")
        didRequestBrowserAuth = false
      }
    }
  }
}

enum MobileBrowserAuthURLBuilder {
  static func signInURL(baseURL: URL, returnRoute: String = "/app") -> URL? {
    guard var components = URLComponents(
      url: baseURL.appending(path: "signin"),
      resolvingAgainstBaseURL: false
    ) else {
      return nil
    }

    components.queryItems = [
      URLQueryItem(name: "mobile_return", value: returnRoute),
    ]

    return components.url
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
