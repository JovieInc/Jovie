import Darwin
import SwiftUI

// UI-testing-only harness types. Kept out of RootView.swift so production
// view code doesn't carry the test scaffolding; everything here is
// DEBUG-only and referenced solely from UI-testing launch modes.
#if DEBUG
enum LiveAuthUITestStatus {
  static let statusKey = "liveAuthUITestStatus"
  static let errorKey = "liveAuthUITestError"
  static let userIDKey = "liveAuthUITestUserID"

  @MainActor
  static func set(_ status: String, error: String? = nil, userID: String? = nil) {
    let defaults = UserDefaults.standard
    defaults.set(status, forKey: statusKey)

    if let error {
      defaults.set(error, forKey: errorKey)
    } else {
      defaults.removeObject(forKey: errorKey)
    }

    if let userID {
      defaults.set(userID, forKey: userIDKey)
    } else if status == "starting" {
      defaults.removeObject(forKey: userIDKey)
    }
  }

  @MainActor
  static func setRouteStatus(_ route: AppRouter, userID: String) {
    switch route {
    case .ready:
      set("ready", userID: userID)
    case .needsOnboarding:
      set("needs_onboarding", userID: userID)
    case .launching:
      set("launching", userID: userID)
    case .signedOut:
      set("signed_out", userID: userID)
    }
  }
}

enum LiveAuthCallbackLaunchInput {
  static func pendingCodeVerifier(processInfo: ProcessInfo = .processInfo) -> String? {
    let verifier = processInfo.environment["JOVIE_IOS_PENDING_CODE_VERIFIER"]?
      .trimmingCharacters(in: .whitespacesAndNewlines)

    guard let verifier, !verifier.isEmpty else {
      return nil
    }

    return verifier
  }

  static func callbackURL(processInfo: ProcessInfo = .processInfo) -> URL? {
    guard let value = argumentValue(
      after: "-ui-testing-open-auth-callback",
      in: processInfo.arguments
    ) else {
      return nil
    }

    return URL(string: value)
  }

  private static func argumentValue(after flag: String, in arguments: [String]) -> String? {
    guard let flagIndex = arguments.firstIndex(of: flag) else {
      return nil
    }

    let valueIndex = arguments.index(after: flagIndex)
    guard arguments.indices.contains(valueIndex) else {
      return nil
    }

    let value = arguments[valueIndex].trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }
}

struct UITestExitButton: View {
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

struct UITestingAuthCallbackRoot: View {
  @Bindable var appState: AppState
  @State private var authErrorMessage: String?
  @State private var handledStates: Set<String> = []
  @State private var liveUserID: String?

  private let expectedCode = "test_code"
  private let expectedVerifier = "test_verifier"
  private let statusKey = "ie.jov.Jovie.authCallbackUITestStatus"
  private let handledCountKey = "ie.jov.Jovie.authCallbackUITestHandledCount"

  init(appState: AppState) {
    self.appState = appState
    // Seed the verifier before the first onOpenURL from a cold launch via
    // XCUIApplication.open(_:) — the async .task below is too late on CI.
    MobileAuthPendingStore.shared.save(codeVerifier: "test_verifier")
  }

  var body: some View {
    RootView(
      appState: appState,
      isAuthAvailable: false,
      isSignInUnavailable: false,
      liveUserID: liveUserID,
      authErrorMessage: authErrorMessage,
      onLogout: { await appState.signOut() },
      onAuthReturn: handleAuthReturn,
      onAuthError: { authErrorMessage = $0 }
    )
    .onOpenURL { url in
      handleCallbackURL(url)
    }
    .onReceive(NotificationCenter.default.publisher(for: .jovieAuthCallbackURL)) { notification in
      guard let url = notification.object as? URL else { return }
      handleCallbackURL(url)
    }
    .task {
      await MainActor.run {
        UserDefaults.standard.removeObject(forKey: statusKey)
        UserDefaults.standard.removeObject(forKey: handledCountKey)
        UserDefaults.standard.set("waiting", forKey: statusKey)
        UserDefaults.standard.set(0, forKey: handledCountKey)
        MobileAuthPendingStore.shared.save(codeVerifier: expectedVerifier)
        if let callbackURL = LiveAuthCallbackLaunchInput.callbackURL() {
          handleCallbackURL(callbackURL)
        }
        for url in MobileAuthCallbackURLInbox.shared.drain() {
          handleCallbackURL(url)
        }
      }
    }
  }

  @MainActor
  private func handleCallbackURL(_ url: URL) {
    if let state = MobileAuthReturnParser.callbackState(url),
       handledStates.contains(state)
    {
      return
    }

    Task { @MainActor in
      if let providerError = MobileAuthReturnParser.parseProviderError(url) {
        authErrorMessage = providerError.userMessage
        UserDefaults.standard.set("error", forKey: statusKey)
        return
      }

      if let state = MobileAuthReturnParser.callbackState(url),
         handledStates.contains(state)
      {
        return
      }

      if let authReturn = await Self.parseAuthReturnWhenReady(
        url,
        pendingStore: .shared,
        codeVerifier: expectedVerifier
      ) {
        handleAuthReturn(authReturn)
        return
      }

      guard MobileAuthReturnParser.isCodeCallback(url) else { return }

      authErrorMessage = "Couldn't finish sign-in. Try again."
      UserDefaults.standard.set("error", forKey: statusKey)
    }
  }

  @MainActor
  private func handleAuthReturn(_ authReturn: MobileAuthReturn) {
    guard !handledStates.contains(authReturn.state) else { return }
    handledStates.insert(authReturn.state)

    guard authReturn.code == expectedCode,
          authReturn.codeVerifier == expectedVerifier
    else {
      authErrorMessage = "Couldn't finish sign-in. Try again."
      return
    }

    authErrorMessage = nil
    liveUserID = "user_ui_auth_callback"
    appState.activeUserID = "user_ui_auth_callback"
    appState.route = .ready
    appState.dashboardState = .loaded(.previewReady)
    appState.isOffline = false
    UserDefaults.standard.set(handledStates.count, forKey: handledCountKey)
    UserDefaults.standard.set("ready", forKey: statusKey)
  }

  @MainActor
  private static func parseAuthReturnWhenReady(
    _ url: URL,
    pendingStore: MobileAuthPendingStore,
    codeVerifier: String,
    maxAttempts: Int = 40
  ) async -> MobileAuthReturn? {
    for _ in 0..<maxAttempts {
      if let authReturn = await MobileAuthReturnParser.parse(url, pendingStore: pendingStore) {
        return authReturn
      }

      pendingStore.save(codeVerifier: codeVerifier)
      try? await Task.sleep(nanoseconds: 50_000_000)
    }

    return nil
  }
}
#endif
