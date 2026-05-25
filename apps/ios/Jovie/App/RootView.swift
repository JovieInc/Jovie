import ClerkKit
import Darwin
import Observation
import SwiftUI

private enum LiveAuthBootstrapError: LocalizedError {
  case bootstrapFailed(stage: String, message: String)
  case missingEmailAddress
  case missingUser

  var errorDescription: String? {
    switch self {
    case let .bootstrapFailed(stage, message):
      return "Live auth bootstrap failed during \(stage): \(message)"
    case .missingEmailAddress:
      return "Missing E2E_CLERK_USER_USERNAME for live auth bootstrap."
    case .missingUser:
      return "Clerk did not expose a signed-in user after live auth bootstrap."
    }
  }
}

private enum MobileAuthReturnError: LocalizedError {
  case missingSignedInUser

  var errorDescription: String? {
    switch self {
    case .missingSignedInUser:
      "You're signed in, but we couldn't load your profile. Try again."
    }
  }
}

private enum LiveAuthBootstrapper {
  @MainActor
  static func signInFromEnvironment(
    processInfo: ProcessInfo = .processInfo
  ) async throws -> String {
    let environment = processInfo.environment
    let emailAddress = environment["E2E_CLERK_USER_USERNAME"] ?? ""
    let verificationCode = environment["JOVIE_IOS_LIVE_AUTH_CODE"] ?? "424242"

    guard !emailAddress.isEmpty else {
      throw LiveAuthBootstrapError.missingEmailAddress
    }

    try? await Clerk.shared.auth.signOut()

    let signIn: SignIn
    do {
      signIn = try await Clerk.shared.auth.signIn(emailAddress)
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "signIn",
        message: error.localizedDescription
      )
    }

    let preparedSignIn: SignIn
    do {
      preparedSignIn = try await signIn.sendEmailCode()
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "sendEmailCode",
        message: error.localizedDescription
      )
    }

    let completedSignIn: SignIn
    do {
      completedSignIn = try await preparedSignIn.verifyCode(verificationCode)
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "verifyCode",
        message: error.localizedDescription
      )
    }

    if let sessionID = completedSignIn.createdSessionId,
       Clerk.shared.session?.id != sessionID
    {
      do {
        try await Clerk.shared.auth.setActive(sessionId: sessionID)
      } catch {
        throw LiveAuthBootstrapError.bootstrapFailed(
          stage: "setActive",
          message: error.localizedDescription
        )
      }
    }

    do {
      _ = try await Clerk.shared.refreshClient()
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "refreshClient",
        message: error.localizedDescription
      )
    }

    do {
      _ = try await ClerkTokenProvider().bearerToken(forceRefresh: false)
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "getToken",
        message: error.localizedDescription
      )
    }

    guard let userID = Clerk.shared.user?.id else {
      throw LiveAuthBootstrapError.missingUser
    }

    return userID
  }
}

private struct AppContentView: View {
  @Bindable var appState: AppState
  let authErrorMessage: String?
  let onLogout: @MainActor () async -> Void
  let onAuthReturn: @MainActor (MobileAuthReturn) -> Void

  var body: some View {
    Group {
      switch appState.route {
      case .launching:
        SplashView()
      case .signedOut:
        AuthScreen(
          isMock: !appState.launchMode.usesLiveClerk,
          webBaseURL: appState.configuration.webBaseURL,
          errorMessage: authErrorMessage,
          onAuthReturn: onAuthReturn
        )
      case .needsOnboarding:
        AppShellView(
          profile: AppShellProfile(response: nil),
          isOffline: false,
          initialTab: .profile,
          opensSettingsOnLaunch: appState.launchMode.opensSettingsOnLaunch,
          billingURL: appState.billingURL,
          onLogout: onLogout
        ) {
          NeedsOnboardingView(continueURL: appState.continueOnWebURL)
        } chatContent: {
          MobileChatHomeView(isOffline: false)
        }
      case .ready:
        AppShellView(
          profile: AppShellProfile(response: appState.loadedDashboardResponse),
          isOffline: appState.isOffline,
          initialTab: appState.launchMode.opensChatOnLaunch ? .chat : .profile,
          opensSettingsOnLaunch: appState.launchMode.opensSettingsOnLaunch,
          billingURL: appState.billingURL,
          onLogout: onLogout
        ) {
          DashboardView(
            state: appState.dashboardState,
            isOffline: appState.isOffline,
            brightnessManager: appState.brightnessManager,
            showVenueModeOnLaunch: appState.launchMode.opensVenueModeOnLaunch,
            loadAppleWalletProfilePass: {
              try await APIClient(
                baseURL: appState.configuration.apiBaseURL,
                tokenProvider: ClerkTokenProvider()
              ).fetchAppleWalletProfilePass()
            },
            onRetry: { await appState.retry() }
          )
        } chatContent: {
          MobileChatHomeView(isOffline: appState.isOffline)
        }
      }
    }
  }
}

private struct MobileChatHomeView: View {
  let isOffline: Bool

  @State private var draft = ""

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      VStack(spacing: 0) {
        Spacer(minLength: 120)

        VStack(spacing: JovieSpacing.large) {
          JovieLogoMark(size: 34)

          VStack(spacing: JovieSpacing.small) {
            Text("Ask Jovie")
              .font(JovieFont.display(size: 28))
              .foregroundStyle(JovieColor.textPrimary)
              .multilineTextAlignment(.center)

            Text(isOffline ? "Offline. Drafts stay on this device." : "Native chat is in alpha for internal testers.")
              .font(JovieFont.body(size: 15))
              .foregroundStyle(JovieColor.textTertiary)
              .multilineTextAlignment(.center)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        .frame(maxWidth: 330)
        .padding(.horizontal, JovieSpacing.xLarge)

        Spacer(minLength: 48)

        ChatComposerPreview(draft: $draft)
          .padding(.horizontal, JovieSpacing.large)
          .padding(.bottom, JovieSpacing.medium)
      }
    }
    .accessibilityIdentifier("mobile-chat")
  }
}

private struct ChatComposerPreview: View {
  @Binding var draft: String

  var body: some View {
    let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)

    HStack(spacing: JovieSpacing.medium) {
      TextField("Ask Jovie", text: $draft)
        .textInputAutocapitalization(.sentences)
        .disableAutocorrection(false)
        .font(JovieFont.body(size: 16))
        .foregroundStyle(JovieColor.textPrimary)
        .frame(height: 52)

      Button {
        draft = ""
      } label: {
        Image(systemName: "arrow.up")
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(trimmedDraft.isEmpty ? JovieColor.textTertiary : JovieColor.backgroundBase)
          .frame(width: 36, height: 36)
          .background(
            trimmedDraft.isEmpty ? JovieColor.surface2 : Color.white,
            in: Circle()
          )
      }
      .buttonStyle(.plain)
      .disabled(trimmedDraft.isEmpty)
      .accessibilityLabel("Send")
    }
    .padding(.horizontal, JovieSpacing.large)
    .frame(height: 64)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 28, style: .continuous)
        .stroke(JovieColor.borderDefault, lineWidth: 1)
    }
    .accessibilityIdentifier("chat-composer")
  }
}

struct RootView: View {
  @Bindable var appState: AppState
  let liveUserID: String?
  let authErrorMessage: String?
  let onLogout: @MainActor () async -> Void
  let onAuthReturn: @MainActor (MobileAuthReturn) -> Void

  var body: some View {
    ZStack {
      AppContentView(
        appState: appState,
        authErrorMessage: authErrorMessage,
        onLogout: onLogout,
        onAuthReturn: onAuthReturn
      )

#if DEBUG
      if ProcessInfo.processInfo.arguments.contains("-ui-testing-allow-exit") {
        UITestExitButton()
      }
#endif
    }
      .task(id: "\(appState.didLoadClerk)-\(liveUserID ?? "signed-out")") {
        if appState.launchMode.requiresAutoAuth, liveUserID == nil {
          return
        }

        if let liveUserID, appState.activeUserID == liveUserID {
          return
        }

        await appState.handleSignedInUserChange(liveUserID)
      }
  }
}

#if DEBUG
private struct UITestExitButton: View {
  var body: some View {
    VStack {
      Spacer()

      HStack {
        Spacer()

        Button("End UI Test Session") {
          Darwin.exit(0)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("ui-test-exit")
        .foregroundStyle(.white)
        .frame(width: 80, height: 80)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 8))
      }
    }
    .allowsHitTesting(true)
    .ignoresSafeArea()
  }
}
#endif

struct LiveRootContainer: View {
  @Environment(Clerk.self) private var clerk
  @Bindable var appState: AppState
  @State private var didBootstrapLiveAuth = false
  @State private var authReturnTask: Task<Void, Never>?
  @State private var authErrorMessage: String?

  var body: some View {
    RootView(
      appState: appState,
      liveUserID: clerk.user?.id,
      authErrorMessage: authErrorMessage,
      onLogout: {
        try? await clerk.auth.signOut()
        await appState.signOut()
      },
      onAuthReturn: handleAuthReturn
    )
      .onOpenURL { url in
        handleAuthReturn(url)
      }
      .task(id: appState.launchMode.requiresAutoAuth) {
        guard appState.launchMode.requiresAutoAuth, didBootstrapLiveAuth == false else {
          return
        }

        didBootstrapLiveAuth = true

        do {
          let userID = try await LiveAuthBootstrapper.signInFromEnvironment()
          await appState.handleSignedInUserChange(userID)
        } catch {
          appState.route = .ready
          appState.dashboardState = .error(
            error.localizedDescription.isEmpty
              ? "Live auth bootstrap failed."
              : error.localizedDescription
          )
        }
      }
      .onDisappear {
        authReturnTask?.cancel()
        authReturnTask = nil
      }
  }

  @MainActor
  private func handleAuthReturn(_ url: URL) {
    guard let authReturn = MobileAuthReturnParser.parse(url) else { return }
    handleAuthReturn(authReturn)
  }

  @MainActor
  private func handleAuthReturn(_ authReturn: MobileAuthReturn) {
    authReturnTask?.cancel()
    authErrorMessage = nil
    appState.route = .launching

    authReturnTask = Task { @MainActor in
      defer {
        authReturnTask = nil
      }

      do {
        let exchangeResponse = try await NativeAuthExchangeClient(
          baseURL: appState.configuration.webBaseURL
        ).exchange(authReturn)
        let signIn = try await clerk.auth.signInWithTicket(exchangeResponse.ticket)

        if let sessionID = signIn.createdSessionId,
           clerk.session?.id != sessionID
        {
          try await clerk.auth.setActive(sessionId: sessionID)
        }

        _ = try await clerk.refreshClient()
        _ = try await ClerkTokenProvider().bearerToken(forceRefresh: false)

        guard let userID = clerk.user?.id else {
          throw MobileAuthReturnError.missingSignedInUser
        }

        await appState.handleSignedInUserChange(userID)
      } catch {
        guard !(error is CancellationError), !Task.isCancelled else {
          return
        }

        if error is MobileAuthReturnError {
          try? await clerk.auth.signOut()
          await appState.signOut()
          authErrorMessage = "Couldn't finish sign-in. Try again."
          return
        }

        if let existingUserID = clerk.user?.id {
          await appState.handleSignedInUserChange(existingUserID)
        } else {
          await appState.signOut()
        }

        authErrorMessage = "Couldn't finish sign-in. Try again."
      }
    }
  }
}

private extension AppState {
  var loadedDashboardResponse: MobileMeResponse? {
    guard case let .loaded(response) = dashboardState else {
      return nil
    }

    return response
  }
}
