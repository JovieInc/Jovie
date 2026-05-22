import ClerkKit
import SwiftUI
import UIKit

struct AuthScreen: View {
  let isMock: Bool
  let webBaseURL: URL
  let onAuthenticated: @MainActor (String) async -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var isBackdropActive = false

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()
      CinematicLoadingBackdrop(isActive: isBackdropActive && !reduceMotion)

      ScrollView {
        VStack(spacing: JovieSpacing.xxLarge) {
          Spacer(minLength: 18)
          AuthHero()

          if isMock {
            MockAuthForm(webBaseURL: webBaseURL)
          } else {
            LiveEmailCodeAuthForm(
              webBaseURL: webBaseURL,
              onAuthenticated: onAuthenticated
            )
          }

          Spacer(minLength: 18)
        }
        .frame(maxWidth: 430)
        .padding(.horizontal, JovieSpacing.xLarge)
        .padding(.vertical, JovieSpacing.xxLarge)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 720)
      }
      .scrollIndicators(.hidden)
    }
    .accessibilityIdentifier("auth-screen")
    .task {
      isBackdropActive = true
    }
  }
}

enum AuthFormInput {
  static func normalizedEmail(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  static func isLikelyEmail(_ value: String) -> Bool {
    let email = normalizedEmail(value)
    let parts = email.split(separator: "@", omittingEmptySubsequences: false)

    guard parts.count == 2,
          let local = parts.first,
          let domain = parts.last,
          !local.isEmpty,
          domain.contains(".")
    else {
      return false
    }

    return domain.split(separator: ".").allSatisfy { !$0.isEmpty }
  }

  static func normalizedCode(_ value: String) -> String {
    String(value.filter(\.isNumber).prefix(6))
  }
}

private enum AuthStep {
  case email
  case code
}

private enum AuthField: Hashable {
  case email
  case code
}

private struct AuthHero: View {
  var body: some View {
    VStack(spacing: JovieSpacing.large) {
      ZStack {
        Circle()
          .fill(JovieColor.surface1.opacity(0.92))
          .frame(width: 82, height: 82)
          .overlay {
            Circle().stroke(JovieColor.borderStrong, lineWidth: 1)
          }

        Image("Jovie-logo")
          .resizable()
          .scaledToFit()
          .frame(width: 50, height: 50)
          .accessibilityHidden(true)
      }

      Text("Jovie")
        .font(JovieFont.display(size: 24, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
    }
  }
}

private struct LiveEmailCodeAuthForm: View {
  @Environment(Clerk.self) private var clerk
  @Environment(\.openURL) private var openURL

  let webBaseURL: URL
  let onAuthenticated: @MainActor (String) async -> Void

  @State private var email = ""
  @State private var code = ""
  @State private var step: AuthStep = .email
  @State private var signIn: SignIn?
  @State private var isSubmitting = false
  @State private var errorMessage: String?
  @FocusState private var focusedField: AuthField?

  private var canSubmit: Bool {
    switch step {
    case .email:
      return AuthFormInput.isLikelyEmail(email)
    case .code:
      return AuthFormInput.normalizedCode(code).count == 6
    }
  }

  var body: some View {
    AuthPanel {
      VStack(spacing: JovieSpacing.xLarge) {
        AuthStepHeader(
          title: step == .email ? "Sign in to Jovie" : "Enter your code",
          subtitle: step == .email
            ? "Use the email connected to your Jovie account."
            : "We sent a 6-digit code to \(AuthFormInput.normalizedEmail(email))."
        )

        VStack(spacing: JovieSpacing.large) {
          if step == .email {
            AuthTextField(
              title: "Email",
              placeholder: "you@example.com",
              text: $email,
              systemImage: "envelope",
              keyboardType: .emailAddress,
              textContentType: .emailAddress,
              focus: $focusedField,
              field: .email
            )
            .onSubmit {
              Task { await submitEmail() }
            }
          } else {
            AuthTextField(
              title: "Code",
              placeholder: "000000",
              text: Binding(
                get: { code },
                set: { code = AuthFormInput.normalizedCode($0) }
              ),
              systemImage: "number",
              keyboardType: .numberPad,
              textContentType: .oneTimeCode,
              focus: $focusedField,
              field: .code
            )

            Button {
              step = .email
              code = ""
              errorMessage = nil
              focusedField = .email
            } label: {
              Label("Use a different email", systemImage: "arrow.left")
                .font(JovieFont.body(size: 13, weight: .semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(JovieColor.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
          }
        }

        AuthErrorText(message: errorMessage)

        Button {
          Task { await submit() }
        } label: {
          AuthPrimaryButtonLabel(
            title: step == .email ? "Continue" : "Verify code",
            systemImage: step == .email ? "arrow.right" : "checkmark",
            isLoading: isSubmitting
          )
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
        .disabled(!canSubmit || isSubmitting)
        .opacity(canSubmit ? 1 : 0.48)

        Button {
          openURL(webBaseURL.appending(path: "signin"))
        } label: {
          Label("Open Jovie on web", systemImage: "safari")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(JoviePillButtonStyle(filled: false))
      }
    }
    .onAppear {
      focusedField = .email
    }
  }

  @MainActor
  private func submit() async {
    switch step {
    case .email:
      await submitEmail()
    case .code:
      await submitCode()
    }
  }

  @MainActor
  private func submitEmail() async {
    guard AuthFormInput.isLikelyEmail(email), !isSubmitting else { return }

    isSubmitting = true
    errorMessage = nil

    do {
      signIn = try await clerk.auth.signInWithEmailCode(
        emailAddress: AuthFormInput.normalizedEmail(email)
      )
      code = ""
      step = .code
      focusedField = .code
    } catch {
      errorMessage = AuthErrorMapper.message(for: error)
    }

    isSubmitting = false
  }

  @MainActor
  private func submitCode() async {
    let verificationCode = AuthFormInput.normalizedCode(code)
    guard verificationCode.count == 6, !isSubmitting else { return }

    guard let signIn else {
      step = .email
      errorMessage = "Enter your email again to request a fresh code."
      return
    }

    isSubmitting = true
    errorMessage = nil

    do {
      let completedSignIn = try await signIn.verifyCode(verificationCode)

      if let sessionID = completedSignIn.createdSessionId,
         clerk.session?.id != sessionID
      {
        try await clerk.auth.setActive(sessionId: sessionID)
      }

      _ = try await clerk.refreshClient()
      _ = try await ClerkTokenProvider().bearerToken(forceRefresh: false)

      guard let userID = clerk.user?.id ?? Clerk.shared.user?.id else {
        errorMessage = "You're signed in, but we couldn't load your profile. Try again."
        isSubmitting = false
        return
      }

      await onAuthenticated(userID)
    } catch {
      errorMessage = AuthErrorMapper.message(for: error)
    }

    isSubmitting = false
  }
}

private struct MockAuthForm: View {
  @Environment(\.openURL) private var openURL
  let webBaseURL: URL

  var body: some View {
    AuthPanel {
      VStack(spacing: JovieSpacing.xLarge) {
        AuthStepHeader(
          title: "Sign in to Jovie",
          subtitle: "Use the email connected to your Jovie account."
        )

        VStack(spacing: JovieSpacing.large) {
          AuthStaticField(
            title: "Email",
            value: "you@example.com",
            systemImage: "envelope"
          )

          AuthErrorText(message: nil)

          Button {} label: {
            AuthPrimaryButtonLabel(
              title: "Continue",
              systemImage: "arrow.right",
              isLoading: false
            )
          }
          .buttonStyle(JoviePillButtonStyle(filled: true))
          .disabled(true)
          .opacity(0.48)

          Button {
            openURL(webBaseURL.appending(path: "signin"))
          } label: {
            Label("Open Jovie on web", systemImage: "safari")
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(JoviePillButtonStyle(filled: false))
        }
      }
    }
  }
}

private struct AuthPanel<Content: View>: View {
  let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    content
      .padding(JovieSpacing.xLarge)
      .background(JovieColor.surface0.opacity(0.74), in: RoundedRectangle(cornerRadius: JovieRadius.xLarge, style: .continuous))
      .jovieSurface(radius: JovieRadius.xLarge)
      .overlay {
        RoundedRectangle(cornerRadius: JovieRadius.xLarge, style: .continuous)
          .stroke(JovieColor.borderStrong, lineWidth: 1)
      }
  }
}

private struct AuthStepHeader: View {
  let title: String
  let subtitle: String

  var body: some View {
    VStack(spacing: JovieSpacing.small) {
      Text(title)
        .font(JovieFont.display(size: 28, weight: .semibold))
        .foregroundStyle(JovieColor.textPrimary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .minimumScaleFactor(0.86)

      Text(subtitle)
        .font(JovieFont.body(size: 15, weight: .medium))
        .foregroundStyle(JovieColor.textTertiary)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct AuthTextField: View {
  let title: String
  let placeholder: String
  @Binding var text: String
  let systemImage: String
  let keyboardType: UIKeyboardType
  let textContentType: UITextContentType
  let focus: FocusState<AuthField?>.Binding
  let field: AuthField

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text(title)
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textSecondary)

      HStack(spacing: JovieSpacing.medium) {
        Image(systemName: systemImage)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.textTertiary)
          .frame(width: 20)

        TextField(placeholder, text: $text)
          .font(JovieFont.body(size: 17, weight: .medium))
          .foregroundStyle(JovieColor.textPrimary)
          .keyboardType(keyboardType)
          .textContentType(textContentType)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .focused(focus, equals: field)
          .submitLabel(field == .email ? .continue : .done)
      }
      .frame(height: 56)
      .padding(.horizontal, JovieSpacing.large)
      .background(JovieColor.surface1.opacity(0.92), in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
          .stroke(JovieColor.borderDefault, lineWidth: 1)
      }
    }
  }
}

private struct AuthStaticField: View {
  let title: String
  let value: String
  let systemImage: String

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.small) {
      Text(title)
        .font(JovieFont.body(size: 13, weight: .semibold))
        .foregroundStyle(JovieColor.textSecondary)

      HStack(spacing: JovieSpacing.medium) {
        Image(systemName: systemImage)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(JovieColor.textTertiary)
          .frame(width: 20)

        Text(value)
          .font(JovieFont.body(size: 17, weight: .medium))
          .foregroundStyle(JovieColor.textTertiary)

        Spacer()
      }
      .frame(height: 56)
      .padding(.horizontal, JovieSpacing.large)
      .background(JovieColor.surface1.opacity(0.72), in: RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: JovieRadius.medium, style: .continuous)
          .stroke(JovieColor.borderDefault, lineWidth: 1)
      }
    }
  }
}

private struct AuthErrorText: View {
  let message: String?

  var body: some View {
    Text(message ?? " ")
      .font(JovieFont.body(size: 13, weight: .medium))
      .foregroundStyle(Color(red: 1, green: 0.48, blue: 0.45))
      .multilineTextAlignment(.center)
      .fixedSize(horizontal: false, vertical: true)
      .frame(minHeight: 34)
      .frame(maxWidth: .infinity)
      .accessibilityHidden(message == nil)
  }
}

private struct AuthPrimaryButtonLabel: View {
  let title: String
  let systemImage: String
  let isLoading: Bool

  var body: some View {
    HStack(spacing: JovieSpacing.small) {
      if isLoading {
        ProgressView()
          .tint(JovieColor.backgroundBase)
          .controlSize(.small)
      } else {
        Image(systemName: systemImage)
      }

      Text(title)
    }
    .frame(maxWidth: .infinity)
  }
}

private enum AuthErrorMapper {
  static func message(for error: Error) -> String {
    let rawMessage = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    let lowercased = rawMessage.lowercased()

    if lowercased.contains("code") || lowercased.contains("verification") {
      return "That code did not work. Check the email and try again."
    }

    if lowercased.contains("network") ||
      lowercased.contains("offline") ||
      lowercased.contains("internet") ||
      lowercased.contains("timed out")
    {
      return "We couldn't reach Jovie. Check your connection and try again."
    }

    if lowercased.contains("identifier") ||
      lowercased.contains("email") ||
      lowercased.contains("not found")
    {
      return "Use the email connected to your Jovie account."
    }

    return rawMessage.isEmpty
      ? "Sign in failed. Try again."
      : "Sign in failed. Try again."
  }
}
