import SwiftUI

struct LiveRootContainer: View {
  @Bindable var appState: AppState
  @ObservedObject var authCoordinator: MobileAuthCoordinator
  @State private var didHydrateNativeSession = false
  @State private var canRenderRoot = false
  @State private var biometricLockState: BiometricLockState = .resolvingSession
  @State private var backgroundedAt: Date?
  @State private var isPrivacyShieldVisible = false
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
          authErrorMessage: authCoordinator.authErrorMessage,
          authCoordinator: authCoordinator,
          onLogout: handleLogout
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
        authCoordinator.drainPendingAuthCallbackURLs()
      }
      .task {
        authCoordinator.drainPendingAuthCallbackURLs()
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
        authCoordinator.handleLaunchInputOnce(
          verifier: LiveAuthCallbackLaunchInput.pendingCodeVerifier(),
          callbackURL: LiveAuthCallbackLaunchInput.callbackURL())
      }
#endif
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
    authCoordinator.cancelCurrentAuth()
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

}
