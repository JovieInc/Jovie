import SwiftUI

struct LiveRootContainer: View {
  @Bindable var appState: AppState
  @State private var didHydrateNativeSession = false
  @State private var canRenderRoot = false
  @State private var biometricLockState: BiometricLockState = .resolvingSession
  @State private var backgroundedAt: Date?
  @State private var isPrivacyShieldVisible = false
  @State private var didHandleLaunchAuthCallback = false
  @State private var authReturnSlot = MobileAuthFinalizationSlot()
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
          onAuthError: { message in
            presentUnprovenMobileAuthError(route: appState.route,
              hasFinalizeInFlight: authReturnSlot.task != nil) { authErrorMessage = message }
          }
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
        if let attempt = authReturnSlot.attempt {
          authReturnSlot.cancel(attempt) { _ = appState.reconcileAuth($0) }
        }
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

        Observability.addBreadcrumb(
          .deepLinkRouteMatched,
          level: .warning,
          context: ["route": "auth_error", "url": url]
        )
        presentUnprovenMobileAuthError(route: appState.route,
          hasFinalizeInFlight: authReturnSlot.task != nil) {
          authErrorMessage = providerError.userMessage
          MobileAuthDiagnostics.record("auth_callback_provider_error", detail: providerError.error)
#if DEBUG
          LiveAuthUITestStatus.set("error", error: providerError.userMessage)
#endif
        }
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
      presentUnprovenMobileAuthError(route: appState.route,
        hasFinalizeInFlight: authReturnSlot.task != nil) {
        authErrorMessage = "Couldn't finish sign-in. Try again."
        MobileAuthDiagnostics.record("auth_callback_missing_verifier")
#if DEBUG
        LiveAuthUITestStatus.set("error", error: "Missing pending native auth code verifier.")
#endif
      }
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
    if authReturnSlot.task != nil {
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

    let attempt = NativeSessionTokenStore.beginAuthAttempt()
    appState.acceptAuthAttempt(attempt)
    authErrorMessage = nil
    MobileAuthDiagnostics.record("auth_finalization_started")
#if DEBUG
    LiveAuthUITestStatus.set("exchanging")
#endif
    authReturnSlot.install(attempt) {
      let span = Observability.startSpan(name: .nativeAuthExchangeStarted,
        context: ["stage": "native_auth_return"])
      defer { span.finish(); authReturnSlot.release(attempt) }
      await finalizeMobileAuthAttempt(attempt, exchange: {
        Observability.addBreadcrumb(.nativeAuthExchangeStarted,
          context: ["stage": "native_auth_return"])
        return try await NativeAuthExchangeClient(baseURL: appState.configuration.webBaseURL).exchange(authReturn)
      }, reconcile: { result, error in
        appState.reconcileAuth(result) {
          // This publication is inside the store's one-shot delivery guard.
          guard authReturnSlot.attempt == attempt else { return }
          if result.outcome == .persisted {
            MobileAuthDiagnostics.record("native_exchange_session_token_received")
            Observability.addBreadcrumb(.nativeAuthExchangeSucceeded,
              context: ["stage": "native_session_token"])
            Observability.addBreadcrumb(.nativeSessionPersisted)
          } else if let error { publishAuthFailure(error) }
        }
      }, failure: { claim, error in
        appState.reconcileAuthFailure(claim) { completion in
          NativeSessionTokenStore.performIfCurrent(completion) {
            guard authReturnSlot.attempt == attempt else { return }
            publishAuthFailure(error)
          }
        }
      }, settled: { result in
        NativeSessionTokenStore.performIfCurrent(result) {
          guard authReturnSlot.attempt == attempt else { return }
#if DEBUG
          if authErrorMessage == nil, let userID = appState.activeUserID {
            LiveAuthUITestStatus.setRouteStatus(appState.route, userID: userID)
          }
#endif
        }
      })
    }
  }

  private func publishAuthFailure(_ error: Error) {
    let context = observabilityFailureContext(stage: "native_auth_return", error: error)
    Observability.addBreadcrumb(.nativeAuthExchangeFailed, level: .error, context: context)
    Observability.captureError(error, event: .nativeAuthExchangeFailed, context: context)
    authErrorMessage = "Couldn't finish sign-in. Try again."
    MobileAuthDiagnostics.record("auth_finalization_failed", detail: error.localizedDescription)
#if DEBUG
    LiveAuthUITestStatus.set("error", error: error.localizedDescription.isEmpty
      ? "Native auth callback exchange failed." : error.localizedDescription)
#endif
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
      case let .rejectedBeforeConsume(reason):
        context["status_code"] = 401
        context["reason"] = reason
        context["exchange_phase"] = "preconsume"
      case let .transportFailed(code):
        context["transport_code"] = code
      case .decodingFailed, .invalidResponse:
        break
      }
    }

    return context
  }
}
