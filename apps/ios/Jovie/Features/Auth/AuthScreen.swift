import OSLog
import SwiftUI

private let authLogger = Logger(
  subsystem: Bundle.main.bundleIdentifier ?? "ie.jov.Jovie",
  category: "Auth"
)

struct AuthScreen: View {
  let isMock: Bool
  let isSignInUnavailable: Bool
  let webBaseURL: URL
  let errorMessage: String?
  let onAuthReturn: @MainActor (MobileAuthReturn) -> Void
  let onAuthError: @MainActor (String?) -> Void

  @State private var authCoordinator = MobileAuthCoordinator()
  @State private var didRequestBrowserAuth = false
  @State private var hasAppeared = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Staggered first-appearance entrance: logo -> tagline -> button, 50ms
  /// apart (within the 30-80ms stagger band, .claude/rules/motion.md section 4).
  private static let entranceStagger: Double = 0.05
  private static let entranceOffset: CGFloat = 8

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(spacing: 0) {
        Spacer(minLength: 96)

        VStack(spacing: JovieSpacing.xxLarge) {
          VStack(spacing: JovieSpacing.medium) {
            JovieLogoMark(size: 76)
              .accessibilityIdentifier("auth-jovie-logo")
              .authEntrance(
                hasAppeared: hasAppeared,
                reduceMotion: reduceMotion,
                delay: 0,
                offset: Self.entranceOffset
              )

            Text("Your Music, One Link")
              .font(JovieFont.body(size: 14, weight: .medium))
              .foregroundStyle(JovieColor.textTertiary)
              .accessibilityIdentifier("auth-tagline")
              .authEntrance(
                hasAppeared: hasAppeared,
                reduceMotion: reduceMotion,
                delay: Self.entranceStagger,
                offset: Self.entranceOffset
              )
          }

          BrowserAuthActions(
            isOpening: didRequestBrowserAuth,
            isDisabled: isSignInUnavailable,
            errorMessage: errorMessage,
            action: startBrowserAuth
          )
          .authEntrance(
            hasAppeared: hasAppeared,
            reduceMotion: reduceMotion,
            delay: Self.entranceStagger * 2,
            offset: Self.entranceOffset
          )
        }
        .frame(maxWidth: 430)
        .padding(.horizontal, JovieSpacing.xLarge)

        Spacer(minLength: 96)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .accessibilityIdentifier("auth-screen")
    .onAppear {
      guard !hasAppeared else { return }
      hasAppeared = true
    }
  }

  private func startBrowserAuth() {
    guard !isMock else {
      return
    }

    didRequestBrowserAuth = true
    Observability.addBreadcrumb(
      .authStart,
      context: ["provider": "browser", "base_url": webBaseURL]
    )
    Observability.addBreadcrumb(
      .authProviderSelected,
      context: ["provider": "browser"]
    )
    onAuthError(nil)

    authCoordinator.startSignIn(baseURL: webBaseURL) { result in
      Task { @MainActor in
        didRequestBrowserAuth = false

        switch result {
        case let .success(authReturn):
          onAuthReturn(authReturn)
        case let .failure(error):
          if isAuthSessionCancellation(error) {
            Observability.addBreadcrumb(
              .authSessionClosed,
              context: ["reason": "user_cancelled"]
            )
            return
          }

          Observability.addBreadcrumb(
            .authSessionClosed,
            level: .warning,
            context: ["reason": "browser_auth_failed"]
          )
          Observability.captureError(
            error,
            event: .authSessionClosed,
            context: [
              "stage": "browser_auth",
              "error_type": String(describing: type(of: error)),
            ]
          )
          onAuthError("Couldn't finish sign-in. Try again.")
          authLogger.error("Mobile browser auth failed: \(error.localizedDescription, privacy: .public)")
        }
      }
    }
  }
}

private struct BrowserAuthActions: View {
  let isOpening: Bool
  let isDisabled: Bool
  let errorMessage: String?
  let action: () -> Void

  var body: some View {
    VStack(spacing: JovieSpacing.large) {
      ContinueInBrowserButton(isOpening: isOpening, isDisabled: isDisabled, action: action)

      AuthErrorText(message: errorMessage)
    }
    .frame(maxWidth: .infinity)
  }
}

private struct ContinueInBrowserButton: View {
  let isOpening: Bool
  let isDisabled: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.small) {
        if isOpening, !isDisabled {
          ProgressView()
            .controlSize(.small)
            .tint(JovieColor.backgroundBase)
        }

        Text(buttonTitle)
          .lineLimit(1)
          .minimumScaleFactor(0.82)
      }
      .font(JovieFont.body(size: 16, weight: .semibold))
      .foregroundStyle(isDisabled ? JovieColor.textSecondary : JovieColor.backgroundBase)
      .frame(maxWidth: .infinity)
      .frame(height: 56)
      .contentShape(Rectangle())
    }
    .disabled(isDisabled)
    .buttonStyle(.plain)
    .background(
      Capsule(style: .continuous)
        .fill(isDisabled ? JovieColor.surface2 : Color.white)
    )
    .accessibilityIdentifier("auth-continue-browser-button")
  }

  private var buttonTitle: String {
    if isDisabled {
      return "Sign-in Unavailable"
    }

    return isOpening ? "Opening Browser..." : "Continue in Browser"
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

/// Staged first-appearance entrance: opacity 0->1 + translateY <=8pt->0 on
/// ease-out. Reduce Motion drops the offset and animates opacity only
/// (.claude/rules/motion.md section 6). Opacity/offset never affect layout,
/// so this cannot introduce layout shift.
private struct AuthEntranceModifier: ViewModifier {
  let hasAppeared: Bool
  let reduceMotion: Bool
  let delay: Double
  let offset: CGFloat

  func body(content: Content) -> some View {
    content
      .opacity(hasAppeared ? 1 : 0)
      .offset(y: reduceMotion ? 0 : (hasAppeared ? 0 : offset))
      .animation(JovieMotion.easeOut().delay(delay), value: hasAppeared)
  }
}

private extension View {
  func authEntrance(hasAppeared: Bool, reduceMotion: Bool, delay: Double, offset: CGFloat) -> some View {
    modifier(AuthEntranceModifier(hasAppeared: hasAppeared, reduceMotion: reduceMotion, delay: delay, offset: offset))
  }
}
