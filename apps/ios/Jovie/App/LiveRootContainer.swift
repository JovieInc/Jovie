import SwiftUI

struct LiveRootContainer: View {
  @Bindable var appState: AppState
  @State private var didHydrateNativeSession = false
  @State private var canRenderRoot = false
  @State private var biometricLockState: BiometricLockState = .resolvingSession
  @State private var backgroundedAt: Date?
  @State private var isPrivacyShieldVisible = false
  @State private var didHandleLaunchAuthCallback = false
  @State private var authReturnTask: Task<Void, Never>?
  @State private var handledAuthReturnStates: Set<String> = []
  @State private var startedAuthFinalizeStates: Set<String> = []
  @State private var seenAuthCallbackURLs: Set<String> = []
  @State private var authErrorMessage: String?
  @AppStorage(BiometricLockSettings.enabledStorageKey)
  private var isBiometricLockEnabled = BiometricLockSettings.isEnabledByDefault
  @Environment(\.scenePhase) private var scenePhase

  private let deviceOwnerAuthenticator = LocalDeviceOwnerAuthenticator()

  var body: some View {
    ZStack {
      if canRenderRoot {
        RootView(
          appState: appState,
          isAuthAvailable: true,
          isSignInUnavailable: false,
          authenticatedUserID: appState.activeUserID,
          authErrorMessage: authErrorMessage,
          onLogout: handleLogout,
          onAuthReturn: handleAuthReturn,
          onAuthError: { authErrorMessage = $0 }
        )
        .allowsHitTesting(!isAppContentCovered)
        .accessibilityHidden(isAppContentCovered)
      } else {
        SplashView()
      }

      if biometricLockState.requiresUnlock {
        BiometricLockView(
          state: biometricLockState,
          onAuthenticate: authenticateDeviceOwner,
          onLogout: handleLogout
        )
        .transition(.opacity)
        .zIndex(2)
      } else if isPrivacyShieldVisible {
        BiometricPrivacyShieldView()
          .zIndex(1)
      }
    }
      .onOpenURL { url in
        MobileAuthCallbackURLInbox.shared.enqueue(url)
      }
      .onReceive(NotificationCenter.default.publisher(for: .jovieAuthCallbackURL)) { _ in
        drainPendingAuthCallbackURLs()
      }
      .task {
        drainPendingAuthCallbackURLs()
      }
      .task(id: appState.didInitializeAuth) {
        guard appState.didInitializeAuth, didHydrateNativeSession == false else {
          return
        }

        didHydrateNativeSession = true
        if let nativeSession = NativeSessionTokenStore.load() {
          MobileAuthDiagnostics.record("native_session_hydrated")
          if BiometricLockPolicy.shouldRequireUnlock(
            isEnabled: isBiometricLockActive,
            hasSession: true,
            event: .coldLaunch
          ) {
            biometricLockState = .locked(message: nil)
          } else {
            biometricLockState = .unlocked
            canRenderRoot = true
            await appState.handleSignedInUserChange(nativeSession.userID)
          }
        } else {
          biometricLockState = .unlocked
          canRenderRoot = true
          await appState.handleSignedInUserChange(nil)
        }
      }
      .onChange(of: scenePhase) { _, phase in
        handleScenePhaseChange(phase)
      }
      .onChange(of: isBiometricLockEnabled) { _, isEnabled in
        handleBiometricSettingChange(isEnabled: isEnabled)
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

  private var isBiometricLockActive: Bool {
    appState.launchMode == .live && isBiometricLockEnabled
  }

  private var hasProtectedSession: Bool {
    appState.activeUserID != nil || NativeSessionTokenStore.load() != nil
  }

  private var isAppContentCovered: Bool {
    biometricLockState.requiresUnlock || isPrivacyShieldVisible
  }

  @MainActor
  private func authenticateDeviceOwner() async {
    guard biometricLockState.requiresUnlock,
          biometricLockState != .authenticating,
          isBiometricLockActive
    else {
      return
    }

    biometricLockState = .authenticating
    let result = await deviceOwnerAuthenticator.authenticate(
      reason: "Unlock your Jovie creator account"
    )

    guard biometricLockState == .authenticating, isBiometricLockActive else {
      return
    }

    switch result {
    case .authenticated:
      biometricLockState = .unlocked
      canRenderRoot = true
      if appState.activeUserID == nil,
         let nativeSession = NativeSessionTokenStore.load()
      {
        await appState.handleSignedInUserChange(nativeSession.userID)
      }
    case .cancelled:
      biometricLockState = .locked(
        message: "Jovie is still locked. Try again when you're ready."
      )
    case .unavailable:
      biometricLockState = .locked(
        message: "Set up Face ID, Touch ID, or a device passcode in Settings, then try again."
      )
    case .failed:
      biometricLockState = .locked(
        message: "We couldn't verify you. Try again or use your device passcode."
      )
    }
  }

  @MainActor
  private func handleLogout() async {
    guard let completion = await appState.signOut() else { return }
    NativeSessionTokenStore.performIfCurrent(completion) {
      biometricLockState = .unlocked
      isPrivacyShieldVisible = false
      backgroundedAt = nil
      canRenderRoot = true
    }
  }

  @MainActor
  private func handleBiometricSettingChange(isEnabled: Bool) {
    guard appState.launchMode == .live else { return }

    if !isEnabled {
      biometricLockState = .unlocked
      isPrivacyShieldVisible = false
      backgroundedAt = nil
      canRenderRoot = true
      if appState.activeUserID == nil,
         let nativeSession = NativeSessionTokenStore.load()
      {
        Task {
          await appState.handleSignedInUserChange(nativeSession.userID)
        }
      }
    } else if appState.activeUserID != nil {
      biometricLockState = .locked(message: nil)
    }
  }

  @MainActor
  private func handleScenePhaseChange(_ phase: ScenePhase) {
    switch phase {
    case .active:
      let backgroundDuration = backgroundedAt.map {
        max(0, Date().timeIntervalSince($0))
      } ?? 0
      backgroundedAt = nil

      if BiometricLockPolicy.shouldRequireUnlock(
        isEnabled: isBiometricLockActive,
        hasSession: hasProtectedSession,
        event: .foregrounded(backgroundDuration: backgroundDuration)
      ) {
        biometricLockState = .locked(message: nil)
      }
      isPrivacyShieldVisible = false
    case .inactive:
      if isBiometricLockActive, hasProtectedSession {
        isPrivacyShieldVisible = true
      }
    case .background:
      if isBiometricLockActive, hasProtectedSession {
        backgroundedAt = backgroundedAt ?? Date()
        isPrivacyShieldVisible = true
      }
    @unknown default:
      if isBiometricLockActive, hasProtectedSession {
        isPrivacyShieldVisible = true
      }
    }
  }

  @MainActor
  private func drainPendingAuthCallbackURLs() {
    for url in MobileAuthCallbackURLInbox.shared.drain() {
      handleAuthReturn(url)
    }
  }

  @MainActor
  private func handleAuthReturn(_ url: URL) {
    Observability.addBreadcrumb(
      .deepLinkReceived,
      context: ["url": url]
    )

    let callbackKey = url.absoluteString
    if seenAuthCallbackURLs.contains(callbackKey) {
      return
    }
    seenAuthCallbackURLs.insert(callbackKey)

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

      claimAuthCallbackStateBeforeConsumingVerifier(url)

      if let authReturn = await MobileAuthReturnParser.parse(url, pendingStore: .shared) {
        Observability.addBreadcrumb(
          .deepLinkRouteMatched,
          context: ["route": "auth_return", "url": url]
        )
        handleAuthReturn(authReturn)
        return
      }

      guard MobileAuthReturnParser.isCodeCallback(url) else {
        if let signedInRoute = MobileSignedInLinkRoute.resolve(url) {
          Observability.addBreadcrumb(
            .deepLinkRouteMatched,
            context: ["route": signedInRoute.rawValue, "url": url]
          )
          IntentNavigationStore.shared.submit(signedInRoute.intent)
          return
        }

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

      if let state = MobileAuthReturnParser.callbackState(url),
         handledAuthReturnStates.contains(state)
      {
        return
      }

      claimAuthCallbackStateBeforeConsumingVerifier(url)

      if let authReturn = await MobileAuthReturnParser.parse(url, pendingStore: .shared) {
        Observability.addBreadcrumb(
          .deepLinkRouteMatched,
          context: ["route": "auth_return", "url": url]
        )
        handleAuthReturn(authReturn)
        return
      }

      guard shouldSignOutAfterMissingVerifier(
        callbackState: MobileAuthReturnParser.callbackState(url),
        handledStates: handledAuthReturnStates,
        hasFinalizeInFlight: isAuthFinalizeInFlight(for: url),
        hasStoredSession: NativeSessionTokenStore.load() != nil
      ) else {
        return
      }

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
    }
  }

  @MainActor
  private func claimAuthCallbackStateBeforeConsumingVerifier(_ url: URL) {
    guard MobileAuthPendingStore.shared.hasCodeVerifier(),
          let state = MobileAuthReturnParser.callbackState(url)
    else {
      return
    }

    handledAuthReturnStates.insert(state)
  }

  @MainActor
  private func isAuthFinalizeInFlight(for url: URL) -> Bool {
    if authReturnTask != nil {
      return true
    }

    guard let state = MobileAuthReturnParser.callbackState(url) else {
      return false
    }

    return startedAuthFinalizeStates.contains(state)
  }

  @MainActor
  private func handleAuthReturn(_ authReturn: MobileAuthReturn) {
    handledAuthReturnStates.insert(authReturn.state)
    guard !startedAuthFinalizeStates.contains(authReturn.state) else { return }
    startedAuthFinalizeStates.insert(authReturn.state)

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
      case let .requestFailed(statusCode, reason):
        context["status_code"] = statusCode
        if let reason, !reason.isEmpty {
          context["reason"] = reason
        }
      case let .transportFailed(code):
        context["transport_code"] = code
      case .decodingFailed, .invalidResponse:
        break
      }
    }

    return context
  }
}
