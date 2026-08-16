import SwiftUI

struct LiveRootContainer: View {
  @Bindable var appState: AppState
  @State private var didHydrateNativeSession = false
  @State private var didHandleLaunchAuthCallback = false
  @State private var authReturnTask: Task<Void, Never>?
  @State private var handledAuthReturnStates: Set<String> = []
  @State private var authErrorMessage: String?

  var body: some View {
    RootView(
      appState: appState,
      isAuthAvailable: true,
      isSignInUnavailable: false,
      authenticatedUserID: appState.activeUserID,
      authErrorMessage: authErrorMessage,
      onLogout: {
        await appState.signOut()
      },
      onAuthReturn: handleAuthReturn,
      onAuthError: { authErrorMessage = $0 }
    )
      .onOpenURL { url in
        handleAuthReturn(url)
      }
      .onReceive(NotificationCenter.default.publisher(for: .jovieAuthCallbackURL)) { notification in
        guard let url = notification.object as? URL else { return }
        handleAuthReturn(url)
      }
      .task {
        for url in MobileAuthCallbackURLInbox.shared.drain() {
          handleAuthReturn(url)
        }
      }
      .task(id: appState.didInitializeAuth) {
        guard appState.didInitializeAuth, didHydrateNativeSession == false else {
          return
        }

        didHydrateNativeSession = true
        if let nativeSession = NativeSessionTokenStore.load() {
          MobileAuthDiagnostics.record("native_session_hydrated")
          await appState.handleSignedInUserChange(nativeSession.userID)
        } else {
          await appState.handleSignedInUserChange(nil)
        }
      }
#if DEBUG
      .task(id: appState.route) {
        guard appState.launchMode == .uiTestingLiveAuth,
              let activeUserID = appState.activeUserID
        else {
          return
        }

        LiveAuthUITestStatus.setRouteStatus(appState.route, userID: activeUserID)
      }

      .task {
        guard appState.launchMode == .uiTestingLiveAuth,
              didHandleLaunchAuthCallback == false
        else {
          return
        }

        didHandleLaunchAuthCallback = true

        if let verifier = LiveAuthCallbackLaunchInput.pendingCodeVerifier() {
          LiveAuthUITestStatus.set("waiting")
          MobileAuthPendingStore.shared.save(codeVerifier: verifier)
        }

        if let callbackURL = LiveAuthCallbackLaunchInput.callbackURL() {
          handleAuthReturn(callbackURL)
        }
      }
#endif
      .onDisappear {
        authReturnTask?.cancel()
        authReturnTask = nil
      }
  }

  @MainActor
  private func handleAuthReturn(_ url: URL) {
    Observability.addBreadcrumb(
      .deepLinkReceived,
      context: ["url": url]
    )

    if let state = MobileAuthReturnParser.callbackState(url),
       handledAuthReturnStates.contains(state)
    {
      return
    }

    Task { @MainActor in
      if let providerError = MobileAuthReturnParser.parseProviderError(url) {
        guard shouldHandleMobileAuthProviderError(
          route: appState.route,
          hasPendingVerifier: MobileAuthPendingStore.shared.hasCodeVerifier()
        ) else {
          Observability.addBreadcrumb(
            .deepLinkParseFailed,
            level: .warning,
            context: ["reason": "provider_error_without_pending_auth"]
          )
          return
        }

        MobileAuthPendingStore.shared.clear()
        Observability.addBreadcrumb(
          .deepLinkRouteMatched,
          level: .warning,
          context: ["route": "auth_error", "url": url]
        )
        authReturnTask?.cancel()
        authReturnTask = nil
        authErrorMessage = providerError.userMessage
        MobileAuthDiagnostics.record("auth_callback_provider_error", detail: providerError.error)
#if DEBUG
        LiveAuthUITestStatus.set("error", error: providerError.userMessage)
#endif
        return
      }

      if let state = MobileAuthReturnParser.callbackState(url),
         handledAuthReturnStates.contains(state)
      {
        return
      }

      if let authReturn = await MobileAuthReturnParser.parse(url, pendingStore: .shared) {
        Observability.addBreadcrumb(
          .deepLinkRouteMatched,
          context: ["route": "auth_return", "url": url]
        )
        handleAuthReturn(authReturn)
        return
      }

      guard MobileAuthReturnParser.isCodeCallback(url) else {
        Observability.addBreadcrumb(
          .deepLinkRouteUnmatched,
          level: .warning,
          context: ["url": url]
        )
        Observability.addBreadcrumb(
          .deepLinkParseFailed,
          level: .warning,
          context: ["url": url]
        )
        return
      }

      try? await Task.sleep(nanoseconds: 250_000_000)

      guard let authReturn = await MobileAuthReturnParser.parse(url, pendingStore: .shared) else {
        Observability.addBreadcrumb(
          .deepLinkParseFailed,
          level: .warning,
          context: ["reason": "missing_pending_verifier", "url": url]
        )
        await appState.signOut()
        authErrorMessage = "Couldn't finish sign-in. Try again."
        MobileAuthDiagnostics.record("auth_callback_missing_verifier")
#if DEBUG
        LiveAuthUITestStatus.set(
          "error",
          error: "Missing pending native auth code verifier."
        )
#endif
        return
      }

      Observability.addBreadcrumb(
        .deepLinkRouteMatched,
        context: ["route": "auth_return", "url": url]
      )
      handleAuthReturn(authReturn)
    }
  }

  @MainActor
  private func handleAuthReturn(_ authReturn: MobileAuthReturn) {
    guard !handledAuthReturnStates.contains(authReturn.state) else { return }
    handledAuthReturnStates.insert(authReturn.state)

    authReturnTask?.cancel()
    authErrorMessage = nil
    appState.route = .launching
    MobileAuthDiagnostics.record("auth_finalization_started")
#if DEBUG
    LiveAuthUITestStatus.set("exchanging")
#endif

    authReturnTask = Task { @MainActor in
      let span = Observability.startSpan(
        name: .nativeAuthExchangeStarted,
        context: ["stage": "native_auth_return"]
      )
      defer {
        span.finish()
        authReturnTask = nil
      }

      do {
        Observability.addBreadcrumb(
          .nativeAuthExchangeStarted,
          context: ["stage": "native_auth_return"]
        )
        let exchangeResponse = try await runMobileAuthFinalizationStage("exchange") {
          try await NativeAuthExchangeClient(
            baseURL: appState.configuration.webBaseURL
          ).exchange(authReturn)
        }
        Observability.addBreadcrumb(
          .nativeAuthExchangeSucceeded,
          context: ["stage": "native_auth_exchange"]
        )

        guard let finalizationPlan = MobileAuthFinalizationPlanner.plan(for: exchangeResponse) else {
          throw MobileAuthReturnError.missingExchangeCredential
        }

        switch finalizationPlan {
        case let .completeWithNativeSession(sessionToken, userID, expiresInSeconds):
          NativeSessionTokenStore.save(
            token: sessionToken,
            userID: userID,
            expiresAt: Date().addingTimeInterval(TimeInterval(expiresInSeconds))
          )
          MobileAuthDiagnostics.record("native_exchange_session_token_received")
          Observability.addBreadcrumb(
            .nativeAuthExchangeSucceeded,
            context: ["stage": "native_session_token"]
          )
          Observability.addBreadcrumb(.nativeSessionPersisted)
          await appState.handleSignedInUserChange(userID)
#if DEBUG
          LiveAuthUITestStatus.setRouteStatus(appState.route, userID: userID)
#endif
          return
        }
      } catch {
        guard !(error is CancellationError), !Task.isCancelled else {
          return
        }

        let context = observabilityFailureContext(
          stage: "native_auth_return",
          error: error
        )
        Observability.addBreadcrumb(
          .nativeAuthExchangeFailed,
          level: .error,
          context: context
        )
        Observability.captureError(
          error,
          event: .nativeAuthExchangeFailed,
          context: context
        )

        if error is MobileAuthReturnError {
          // Better Auth sign-out clears the native Keychain token and state.
          await appState.signOut()
          authErrorMessage = "Couldn't finish sign-in. Try again."
          MobileAuthDiagnostics.record("auth_finalization_failed", detail: error.localizedDescription)
#if DEBUG
          LiveAuthUITestStatus.set(
            "error",
            error: error.localizedDescription.isEmpty
              ? "Native auth callback exchange failed."
              : error.localizedDescription
          )
#endif
          return
        }

        await appState.signOut()

        authErrorMessage = "Couldn't finish sign-in. Try again."
        MobileAuthDiagnostics.record("auth_finalization_failed", detail: error.localizedDescription)
#if DEBUG
        LiveAuthUITestStatus.set(
          "error",
          error: error.localizedDescription.isEmpty
            ? "Native auth callback exchange failed."
            : error.localizedDescription
        )
#endif
      }
    }
  }

  private func observabilityFailureContext(
    stage: String,
    error: Error
  ) -> ObservabilityContext {
    var context: ObservabilityContext = [
      "stage": stage,
      "error_type": String(describing: type(of: error)),
    ]

    if let error = error as? NativeAuthExchangeError {
      switch error {
      case let .requestFailed(statusCode):
        context["status_code"] = statusCode
      case let .transportFailed(code):
        context["transport_code"] = code
      case .decodingFailed, .invalidResponse:
        break
      }
    }

    return context
  }
}
