import AuthenticationServices
import ClerkKit
import OSLog
import SwiftUI

private let authLogger = Logger(
  subsystem: Bundle.main.bundleIdentifier ?? "ie.jov.Jovie",
  category: "Auth"
)

struct AuthScreen: View {
  let isMock: Bool
  let webBaseURL: URL
  let onAuthenticated: @MainActor (String) async -> Void

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

        if isMock {
          MockSSOAuthActions()
        } else {
          LiveSSOAuthActions(onAuthenticated: onAuthenticated)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .accessibilityIdentifier("auth-screen")
  }
}

private enum SSOProvider: Hashable, Identifiable {
  case google
  case apple

  var id: Self { self }

  var title: String {
    switch self {
    case .google:
      "Continue with Google"
    case .apple:
      "Continue with Apple"
    }
  }

  var clerkProvider: OAuthProvider {
    switch self {
    case .google:
      .google
    case .apple:
      .apple
    }
  }

  var accessibilityIdentifier: String {
    switch self {
    case .google:
      "auth-google-button"
    case .apple:
      "auth-apple-button"
    }
  }
}

private struct MockSSOAuthActions: View {
  var body: some View {
    SSOProviderButtons(
      activeProvider: nil,
      errorMessage: nil,
      onSelect: { _ in }
    )
  }
}

private struct LiveSSOAuthActions: View {
  @Environment(Clerk.self) private var clerk

  let onAuthenticated: @MainActor (String) async -> Void

  @State private var activeProvider: SSOProvider?
  @State private var errorMessage: String?
  @State private var authTask: Task<Void, Never>?

  var body: some View {
    SSOProviderButtons(
      activeProvider: activeProvider,
      errorMessage: errorMessage,
      onSelect: startAuth
    )
    .onDisappear {
      authTask?.cancel()
      authTask = nil
      activeProvider = nil
    }
  }

  @MainActor
  private func startAuth(with provider: SSOProvider) {
    guard activeProvider == nil else { return }

    authTask?.cancel()
    activeProvider = provider
    errorMessage = nil

    authTask = Task { @MainActor in
      defer {
        activeProvider = nil
        authTask = nil
      }

      do {
        let result = try await clerk.auth.signInWithOAuth(
          provider: provider.clerkProvider,
          prefersEphemeralWebBrowserSession: false,
          transferable: true
        )

        guard !Task.isCancelled else { return }
        try await finishAuthentication(result)
      } catch {
        guard !Task.isCancelled else { return }

        if let message = AuthErrorMapper.message(for: error) {
          errorMessage = message
        }
      }
    }
  }

  @MainActor
  private func finishAuthentication(_ result: TransferFlowResult) async throws {
    switch result {
    case let .signIn(signIn):
      if let sessionID = signIn.createdSessionId,
         clerk.session?.id != sessionID
      {
        try await clerk.auth.setActive(sessionId: sessionID)
      }
    case let .signUp(signUp):
      if let sessionID = signUp.createdSessionId,
         clerk.session?.id != sessionID
      {
        try await clerk.auth.setActive(sessionId: sessionID)
      }
    }

    _ = try await clerk.refreshClient()
    _ = try await ClerkTokenProvider().bearerToken(forceRefresh: false)

    guard let userID = clerk.user?.id else {
      authLogger.error("Clerk user missing after successful OAuth verification.")
      throw AuthPresentationError.missingSignedInUser
    }

    await onAuthenticated(userID)
  }
}

private struct SSOProviderButtons: View {
  let activeProvider: SSOProvider?
  let errorMessage: String?
  let onSelect: (SSOProvider) -> Void

  private let providers: [SSOProvider] = [.google, .apple]

  var body: some View {
    VStack(spacing: JovieSpacing.large) {
      VStack(spacing: JovieSpacing.medium) {
        ForEach(providers) { provider in
          SSOProviderButton(
            provider: provider,
            isLoading: activeProvider == provider,
            isDisabled: activeProvider != nil,
            action: { onSelect(provider) }
          )
        }
      }

      AuthErrorText(message: errorMessage)
    }
    .frame(maxWidth: 430)
    .padding(.horizontal, JovieSpacing.xLarge)
    .padding(.bottom, JovieSpacing.xxLarge)
  }
}

private struct SSOProviderButton: View {
  let provider: SSOProvider
  let isLoading: Bool
  let isDisabled: Bool
  let action: () -> Void

  private var isPrimary: Bool {
    provider == .google
  }

  var body: some View {
    Button(action: action) {
      HStack(spacing: JovieSpacing.small) {
        if isLoading {
          ProgressView()
            .controlSize(.small)
            .tint(isPrimary ? JovieColor.backgroundBase : JovieColor.textPrimary)
        }

        Text(provider.title)
          .lineLimit(1)
          .minimumScaleFactor(0.82)
      }
      .font(JovieFont.body(size: 16, weight: .semibold))
      .foregroundStyle(isPrimary ? JovieColor.backgroundBase : JovieColor.textPrimary)
      .frame(maxWidth: .infinity)
      .frame(height: 56)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(isDisabled)
    .background(
      Capsule(style: .continuous)
        .fill(isPrimary ? Color.white : JovieColor.surface1)
    )
    .overlay {
      Capsule(style: .continuous)
        .stroke(isPrimary ? Color.clear : JovieColor.borderDefault, lineWidth: 1)
    }
    .opacity(isDisabled && !isLoading ? 0.62 : 1)
    .accessibilityIdentifier(provider.accessibilityIdentifier)
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

private enum AuthPresentationError: LocalizedError {
  case missingSignedInUser

  var errorDescription: String? {
    switch self {
    case .missingSignedInUser:
      "You're signed in, but we couldn't load your profile. Try again."
    }
  }
}

enum AuthErrorMapper {
  static func message(for error: Error) -> String? {
    if let authError = error as? ASWebAuthenticationSessionError,
       authError.code == .canceledLogin
    {
      return nil
    }

    let rawMessage = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    let lowercased = rawMessage.lowercased()

    if lowercased.contains("cancel") {
      return nil
    }

    if lowercased.contains("network") ||
      lowercased.contains("offline") ||
      lowercased.contains("internet") ||
      lowercased.contains("timed out")
    {
      return "We couldn't reach Jovie. Check your connection and try again."
    }

    if lowercased.contains("not allowed") ||
      lowercased.contains("strategy") ||
      lowercased.contains("oauth")
    {
      return "This sign-in method is not available yet. Try another option."
    }

    return rawMessage.isEmpty
      ? "Sign in failed. Try again."
      : rawMessage
  }
}
