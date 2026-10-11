import AuthenticationServices
import Combine
import OSLog
import CryptoKit
import Foundation
import Security
import UIKit

enum MobileBrowserAuthURLBuilder {
  static func signInURL(
    baseURL: URL,
    returnRoute: String = "/app",
    codeChallenge: String,
    nativeAttempt: String? = nil,
    processInfo: ProcessInfo = .processInfo
  ) -> URL? {
    let safeReturnRoute = sanitizeReturnRoute(returnRoute) ?? "/app"
    let isRealBrowserAuthTest =
      processInfo.arguments.contains("-ui-testing-real-browser-auth") ||
      processInfo.environment["JOVIE_IOS_REAL_BROWSER_AUTH"] == "1"
    let authPath = isRealBrowserAuthTest
      ? (processInfo.environment["JOVIE_IOS_REAL_BROWSER_AUTH_PATH"]?
          .trimmingCharacters(in: .whitespacesAndNewlines)
          .nilIfEmpty ?? "api/dev/test-auth/mobile-provider-complete")
      : "auth/start"

    if isRealBrowserAuthTest, baseURL.scheme?.lowercased() != "https" {
      MobileAuthDiagnostics.record(
        "auth_url_rejected",
        detail: "real browser auth requires HTTPS"
      )
      return nil
    }

    guard isSupportedBrowserAuthURL(baseURL) else {
      MobileAuthDiagnostics.record(
        "auth_url_rejected",
        detail: "browser auth requires https or localhost http"
      )
      return nil
    }

    guard var components = URLComponents(
      url: baseURL.appending(path: authPath),
      resolvingAgainstBaseURL: false
    ) else {
      return nil
    }

    components.queryItems = [
      URLQueryItem(name: "client", value: "ios"),
      URLQueryItem(name: "intent", value: "sign_in"),
      URLQueryItem(name: "return_to", value: safeReturnRoute),
      URLQueryItem(name: "code_challenge", value: codeChallenge),
      URLQueryItem(name: "code_challenge_method", value: "S256"),
    ]

    if let nativeAttempt {
      guard MobileAuthReturnParser.isValidNativeAttempt(nativeAttempt) else { return nil }
      components.queryItems?.append(URLQueryItem(name: "native_attempt", value: nativeAttempt))
    }

    if isRealBrowserAuthTest {
      components.queryItems?.append(
        URLQueryItem(
          name: "persona",
          value: processInfo.environment["JOVIE_IOS_REAL_BROWSER_AUTH_PERSONA"] ?? "creator-ready"
        )
      )

      if let testToken = processInfo.environment["JOVIE_IOS_REAL_BROWSER_AUTH_TOKEN"]?
        .trimmingCharacters(in: .whitespacesAndNewlines),
         !testToken.isEmpty
      {
        components.queryItems?.append(URLQueryItem(name: "test_token", value: testToken))
      }
    }

    guard let url = components.url, isSupportedBrowserAuthURL(url) else {
      return nil
    }

    return url
  }

  static func isSupportedBrowserAuthURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased(),
          let host = url.host?.lowercased(),
          !host.isEmpty
    else {
      return false
    }

    if scheme == "https" {
      return true
    }

    if scheme == "http" {
      return host == "localhost"
        || host == "127.0.0.1"
        || host == "::1"
        || host.hasSuffix(".localhost")
    }

    return false
  }

  private static func sanitizeReturnRoute(_ route: String) -> String? {
    let trimmed = route.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.starts(with: "/"),
          !trimmed.starts(with: "//"),
          !trimmed.contains("://"),
          !trimmed.contains("\\")
    else {
      return nil
    }

    guard let components = URLComponents(string: trimmed),
          components.scheme == nil,
          components.host == nil
    else {
      return nil
    }

    return trimmed
  }
}

enum MobileAuthCoordinatorError: Error, CustomNSError {
  case invalidAuthURL
  case sessionStartFailed
  case missingCallbackURL
  case providerError(MobileAuthProviderError)
  case randomGenerationFailed(OSStatus)

  static var errorDomain: String { "Jovie.MobileAuthCoordinatorError" }

  var errorCode: Int {
    switch self {
    case .invalidAuthURL:
      return 1
    case .sessionStartFailed:
      return 2
    case .missingCallbackURL:
      return 3
    case .providerError:
      return 4
    case .randomGenerationFailed:
      return 5
    }
  }
}

struct MobileAuthWindowSnapshot: Equatable {
  let isKey: Bool
  let isHidden: Bool
}

enum MobileAuthPresentationAnchor {
  static func preferredWindowIndex(
    in windows: [MobileAuthWindowSnapshot]
  ) -> Int? {
    if let keyIndex = windows.firstIndex(where: \.isKey) {
      return keyIndex
    }

    return windows.firstIndex { !$0.isHidden }
  }

  static func current() -> ASPresentationAnchor? {
    let scenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap(\.windows)
    let snapshots = windows.map {
      MobileAuthWindowSnapshot(isKey: $0.isKeyWindow, isHidden: $0.isHidden)
    }

    if let index = preferredWindowIndex(in: snapshots) {
      return windows[index]
    }

    let fallbackScene = scenes.first { $0.activationState == .foregroundActive }
      ?? scenes.first { $0.activationState == .foregroundInactive }
      ?? scenes.first
    guard let fallbackScene else {
      return nil
    }

    if let sceneWindow = fallbackScene.windows.first {
      return sceneWindow
    }

    return ASPresentationAnchor(windowScene: fallbackScene)
  }
}

struct MobileAuthPresentationWindowCandidate: Equatable {
  let isForegroundActive: Bool
  let isKeyWindow: Bool
}

enum MobileAuthPresentationWindowSelector {
  static func selectedIndex(
    from candidates: [MobileAuthPresentationWindowCandidate]
  ) -> Int? {
    let activeIndices = candidates.indices.filter { candidates[$0].isForegroundActive }
    if let keyIndex = activeIndices.first(where: { candidates[$0].isKeyWindow }) {
      return keyIndex
    }
    return activeIndices.first
  }
}

enum MobileAuthPresentationContextRetryPolicy {
  static let maxAttempts = 2

  static func shouldRetry(error: Error, attempt: Int) -> Bool {
    attempt < maxAttempts && isAuthSessionPresentationContextInvalid(error)
  }
}

@MainActor
enum MobileAuthPresentationWindows {
  static func selectedWindow(
    from application: UIApplication = .shared
  ) -> UIWindow? {
    let windows = attachedWindows(from: application)
    let candidates = windows.map { window in
      MobileAuthPresentationWindowCandidate(
        isForegroundActive: window.windowScene?.activationState == .foregroundActive,
        isKeyWindow: window.isKeyWindow
      )
    }
    guard let index = MobileAuthPresentationWindowSelector.selectedIndex(from: candidates) else {
      return nil
    }
    return windows[index]
  }

  static func attachedWindows(from application: UIApplication = .shared) -> [UIWindow] {
    application.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
  }
}

@MainActor
struct MobileAuthBrowserSession {
  let start: @MainActor () -> Bool
  let cancel: @MainActor @Sendable () -> Void
}

@MainActor
struct MobileAuthBrowserDependencies {
  var dispatch: @Sendable (@escaping @MainActor @Sendable () -> Void) -> Task<Void, Never> = { operation in
    Task { @MainActor in operation() }
  }
  var makeNativeAttempt: @MainActor () throws -> String = MobileAuthCoordinator.makeNativeAttempt
  var makeVerifier: @MainActor () throws -> String
  var waitForPresentation: @MainActor () async -> Void
  var hasPresentationAnchor: @MainActor () -> Bool
  var makeSession: @MainActor (
    URL, ASWebAuthenticationPresentationContextProviding,
    @escaping @Sendable (URL?, Error?) -> Void
  ) -> MobileAuthBrowserSession

  static var live: Self {
    Self(makeVerifier: MobileAuthCoordinator.makeCodeVerifier,
      waitForPresentation: MobileAuthCoordinator.waitForForegroundActivePresentationWindow,
      hasPresentationAnchor: { MobileAuthPresentationAnchor.current() != nil },
      makeSession: { url, provider, completion in
        let session = ASWebAuthenticationSession(url: url,
          callback: .customScheme("ie.jov.jovie"), completionHandler: completion)
        session.presentationContextProvider = provider
        session.prefersEphemeralWebBrowserSession = false
        return MobileAuthBrowserSession(start: { session.start() }, cancel: { session.cancel() })
      })
  }
}

@MainActor
final class MobileAuthCoordinator: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
  private let appState: AppState
  private let callbackDelay: @MainActor () async -> Void
  private let exchange: @MainActor (MobileAuthReturn) async throws -> NativeAuthExchangeResponse
  private let authReturnSlot = MobileAuthFinalizationSlot()
  private var handledAuthReturnStates: Set<String> = []
  private var startedAuthFinalizeStates: Set<String> = []
  private var seenAuthCallbackURLs: Set<String> = []
  private var callbackTasks: [UUID: Task<Void, Never>] = [:]
  private var didHandleLaunchAuthCallback = false
  @Published private(set) var authErrorMessage: String?
  @Published private(set) var isOpening = false
  private let pendingStore: MobileAuthPendingStore
  private let browser: MobileAuthBrowserDependencies
  private let dispatch: @Sendable (@escaping @MainActor @Sendable () -> Void) -> Task<Void, Never>
  private var producerID: UUID?
  private var producerPending: MobileAuthPendingStore.Snapshot?
  private var acceptedPending: MobileAuthPendingStore.Snapshot?
  private var producerTask: Task<Void, Never>?
  private var sessionID: UUID?
  private var session: MobileAuthBrowserSession?
  private var cancelSession: (@MainActor @Sendable () -> Void)?

  var workTasks: [Task<Void, Never>] {
    [producerTask, authReturnSlot.task].compactMap { $0 } + Array(callbackTasks.values)
  }

  convenience init(appState: AppState) {
    let baseURL = appState.configuration.webBaseURL
    self.init(appState: appState, pendingStore: .shared, browser: .live,
      callbackDelay: { try? await Task.sleep(nanoseconds: 250_000_000) },
      exchange: { try await NativeAuthExchangeClient(baseURL: baseURL).exchange($0) })
  }

  init(appState: AppState, pendingStore: MobileAuthPendingStore,
       browser: MobileAuthBrowserDependencies,
       callbackDelay: @escaping @MainActor () async -> Void,
       exchange: @escaping @MainActor (MobileAuthReturn) async throws -> NativeAuthExchangeResponse) {
    self.appState = appState
    self.pendingStore = pendingStore
    self.browser = browser
    self.dispatch = browser.dispatch
    self.callbackDelay = callbackDelay
    self.exchange = exchange
    super.init()
  }

  deinit {
    producerTask?.cancel()
    for task in callbackTasks.values { task.cancel() }
    let cancel = cancelSession
    let pending = producerPending
    let accepted = acceptedPending
    let pendingStore = pendingStore
    _ = dispatch { @MainActor in
      cancel?()
      if let pending { pendingStore.clear(matching: pending) }
      if let accepted { pendingStore.clear(matching: accepted) }
    }
  }

  private func retireBrowserProducer() {
    producerID = nil
    sessionID = nil
    producerTask?.cancel()
    producerTask = nil
    let cancel = cancelSession
    let pending = producerPending
    producerPending = nil
    cancelSession = nil
    session = nil
    cancel?()
    if let pending { pendingStore.clear(matching: pending) }
  }

  func startBrowserAuth(isMock: Bool) {
    guard canStartMobileAuth(isMock: isMock, isOpening: isOpening) else { return }
    isOpening = true
    let baseURL = appState.configuration.webBaseURL
    Observability.addBreadcrumb(.authStart, context: ["provider": "browser", "base_url": baseURL])
    Observability.addBreadcrumb(.authProviderSelected, context: ["provider": "browser"])
    presentUnprovenMobileAuthError(route: appState.route,
      hasFinalizeInFlight: authReturnSlot.task != nil) { authErrorMessage = nil }
    startSignIn(baseURL: baseURL) { [weak self] result in
      guard let self else { return }
      self.isOpening = false
      switch result {
      case let .success(authReturn):
        self.handleAuthReturn(authReturn)
      case let .failure(error):
        self.presentBrowserFailure(error)
      }
    }
  }

  private func presentBrowserFailure(_ error: Error) {
    if isAuthSessionCancellation(error) {
      Observability.addBreadcrumb(.authSessionClosed, context: ["reason": "user_cancelled"])
    } else if case MobileAuthCoordinatorError.providerError = error {
      // The callback parser already recorded the provider failure.
    } else {
      Observability.addBreadcrumb(.authSessionClosed, level: .warning,
        context: ["reason": "browser_auth_failed"])
      Observability.captureError(error, event: .authSessionClosed,
        context: ["stage": "browser_auth", "error_type": String(describing: type(of: error))])
      Logger(subsystem: Bundle.main.bundleIdentifier ?? "ie.jov.Jovie", category: "Auth")
        .error("Mobile browser auth failed: \(error.localizedDescription, privacy: .public)")
    }
    presentUnprovenMobileAuthError(route: appState.route,
      hasFinalizeInFlight: authReturnSlot.task != nil) {
      authErrorMessage = mobileAuthFailureMessage(for: error)
    }
  }

  func cancelCurrentAuth() {
    retireBrowserProducer()
    for task in callbackTasks.values { task.cancel() }
    callbackTasks.removeAll()
    isOpening = false
    retireAcceptedAttempt()
  }

  private func retireAcceptedAttempt() {
    let pending = acceptedPending
    acceptedPending = nil
    if let pending { pendingStore.clear(matching: pending) }
    if let attempt = authReturnSlot.attempt {
      authReturnSlot.cancel(attempt) { _ = appState.reconcileAuth($0) }
    }
  }

  func startSignIn(
    baseURL: URL,
    completion: @escaping @MainActor @Sendable (Result<MobileAuthPendingStore.Claim, Error>) -> Void
  ) {
    let codeVerifier: String
    let nativeAttempt: String
    do {
      codeVerifier = try browser.makeVerifier()
      nativeAttempt = try browser.makeNativeAttempt()
    }
    catch { completion(.failure(error)); return }
    let codeChallenge = Self.makeCodeChallenge(verifier: codeVerifier)

    guard let authURL = MobileBrowserAuthURLBuilder.signInURL(
      baseURL: baseURL,
      codeChallenge: codeChallenge,
      nativeAttempt: nativeAttempt
    ) else {
      Observability.addBreadcrumb(
        .authSessionClosed,
        level: .warning,
        context: ["reason": "invalid_auth_url"]
      )
      MobileAuthDiagnostics.record("auth_url_invalid")
      completion(.failure(MobileAuthCoordinatorError.invalidAuthURL))
      return
    }

    guard pendingStore.save(codeVerifier: codeVerifier, nativeAttempt: nativeAttempt, baseURL: baseURL) else {
      completion(.failure(MobileAuthCoordinatorError.invalidAuthURL))
      return
    }
    retireBrowserProducer()
    retireAcceptedAttempt()
    let producer = UUID()
    producerID = producer
    producerPending = pendingStore.snapshot()
    scheduleAuthenticationSession(authURL: authURL,
      producer: producer, pending: pendingStore.snapshot(), attempt: 1, completion: completion)
  }

  private func scheduleAuthenticationSession(
    authURL: URL, producer: UUID,
    pending: MobileAuthPendingStore.Snapshot, attempt: Int,
    completion: @escaping @MainActor @Sendable (Result<MobileAuthPendingStore.Claim, Error>) -> Void
  ) {
    let waitForPresentation = browser.waitForPresentation
    producerTask = Task { @MainActor [weak self] in
      await waitForPresentation()
      guard !Task.isCancelled, let self, self.producerID == producer,
            self.pendingStore.isCurrent(pending) else { return }
      self.openAuthenticationSession(authURL: authURL,
        producer: producer, pending: pending, attempt: attempt, completion: completion)
    }
  }

  private func openAuthenticationSession(
    authURL: URL, producer: UUID,
    pending: MobileAuthPendingStore.Snapshot, attempt: Int,
    completion: @escaping @MainActor @Sendable (Result<MobileAuthPendingStore.Claim, Error>) -> Void
  ) {

    Observability.addBreadcrumb(
      .authSheetOpened,
      context: [
        "auth_url": authURL,
        "attempt": attempt,
      ]
    )
    MobileAuthDiagnostics.record(
      attempt == 1 ? "auth_session_opening" : "auth_session_presentation_retry",
      detail: "\(authURL.host ?? "unknown")\(authURL.path)"
    )

    let sessionID = UUID()
    self.sessionID = sessionID
    let dispatch = dispatch
    let session = browser.makeSession(authURL, self) { [weak self] callbackURL, error in
      _ = dispatch { @MainActor [weak self] in
        guard let self, self.producerID == producer, self.sessionID == sessionID,
              self.pendingStore.isCurrent(pending) else { return }
        self.sessionID = nil
        self.session = nil
        self.cancelSession = nil

        if let error {
          if MobileAuthPresentationContextRetryPolicy.shouldRetry(
            error: error,
            attempt: attempt
          ) {
            Observability.addBreadcrumb(
              .authSessionClosed,
              level: .warning,
              context: [
                "reason": "presentation_context_invalid_retry",
                "attempt": attempt,
              ]
            )
            MobileAuthDiagnostics.record(
              "auth_session_presentation_retry",
              detail: error.localizedDescription
            )
            self.scheduleAuthenticationSession(authURL: authURL,
              producer: producer, pending: pending, attempt: attempt + 1, completion: completion)
            return
          }

          Observability.addBreadcrumb(
            .authSessionClosed,
            context: [
              "reason": "session_error",
              "error_type": String(describing: type(of: error)),
            ]
          )
          self.pendingStore.clear(matching: pending)
          MobileAuthDiagnostics.record("auth_session_error", detail: error.localizedDescription)
          completion(.failure(error))
          return
        }

        guard let callbackURL else {
          Observability.addBreadcrumb(
            .deepLinkParseFailed,
            level: .warning,
            context: ["reason": "missing_callback_url"]
          )
          self.pendingStore.clear(matching: pending)
          MobileAuthDiagnostics.record("auth_callback_missing")
          completion(.failure(MobileAuthCoordinatorError.missingCallbackURL))
          return
        }

        Observability.addBreadcrumb(
          .authCallbackReceived,
          context: ["callback_url": callbackURL]
        )
        MobileAuthDiagnostics.record(
          "auth_callback_received",
          detail: "\(callbackURL.scheme ?? "unknown")://\(callbackURL.host ?? "unknown")\(callbackURL.path)"
        )

        guard self.pendingStore.matches(callbackURL, snapshot: pending,
          baseURL: self.appState.configuration.webBaseURL) else {
          completion(.failure(MobileAuthCoordinatorError.missingCallbackURL))
          return
        }
        if let providerError = MobileAuthReturnParser.parseProviderError(callbackURL) {
          self.pendingStore.clear(matching: pending)
          Observability.addBreadcrumb(
            .deepLinkParseFailed,
            level: .warning,
            context: [
              "reason": "provider_error",
              "error": providerError.error,
            ]
          )
          MobileAuthDiagnostics.record("auth_callback_provider_error", detail: providerError.error)
          completion(.failure(MobileAuthCoordinatorError.providerError(providerError)))
          return
        }

        guard let authReturn = self.pendingStore.claim(callbackURL, matching: pending,
          baseURL: self.appState.configuration.webBaseURL) else {
          Observability.addBreadcrumb(
            .deepLinkParseFailed,
            level: .warning,
            context: ["reason": "missing_or_invalid_callback_url"]
          )
          self.pendingStore.clear(matching: pending)
          MobileAuthDiagnostics.record("auth_callback_parse_failed")
          completion(.failure(MobileAuthCoordinatorError.missingCallbackURL))
          return
        }

        Observability.addBreadcrumb(
          .authCallbackURLParsed,
          context: ["callback_url": callbackURL]
        )
        MobileAuthDiagnostics.record("auth_callback_parsed")
        completion(.success(authReturn))
      }
    }

    self.session = session
    let pendingStore = pendingStore
    cancelSession = {
      session.cancel()
      pendingStore.clear(matching: pending)
    }

    guard browser.hasPresentationAnchor() else {
      self.sessionID = nil
      self.session = nil
      cancelSession = nil
      Observability.addBreadcrumb(
        .authSessionClosed,
        level: .warning,
        context: ["reason": "missing_presentation_anchor"]
      )
      pendingStore.clear(matching: pending)
      MobileAuthDiagnostics.record(
        "auth_session_start_failed",
        detail: "missing_presentation_anchor"
      )
      completion(.failure(MobileAuthCoordinatorError.sessionStartFailed))
      return
    }

    if !session.start() {
      self.sessionID = nil
      self.session = nil
      cancelSession = nil
      Observability.addBreadcrumb(
        .authSessionClosed,
        level: .warning,
        context: ["reason": "session_start_failed"]
      )
      pendingStore.clear(matching: pending)
      MobileAuthDiagnostics.record("auth_session_start_failed")
      completion(.failure(MobileAuthCoordinatorError.sessionStartFailed))
    } else {
      MobileAuthDiagnostics.record("auth_session_opened")
    }
  }

  func drainPendingAuthCallbackURLs() {
    for url in MobileAuthCallbackURLInbox.shared.drain() { handleAuthReturn(url) }
  }

  func handleAuthReturn(_ url: URL) {
    Observability.addBreadcrumb(.deepLinkReceived, context: ["url": url])
    guard seenAuthCallbackURLs.insert(url.absoluteString).inserted else { return }
    let pending = pendingStore.snapshot()
    guard resolveAuthURL(url, pending: pending, isRetry: false) else { return }
    let taskID = UUID()
    let delay = callbackDelay
    callbackTasks[taskID] = Task { @MainActor [weak self] in
      await delay()
      if !Task.isCancelled {
        _ = self?.resolveAuthURL(url, pending: pending, isRetry: true)
      }
      self?.callbackTasks.removeValue(forKey: taskID)
    }
  }

  /// Returns true only when the unchanged local pending snapshot may retry parsing.
  private func resolveAuthURL(_ url: URL, pending: MobileAuthPendingStore.Snapshot,
                              isRetry: Bool) -> Bool {
    guard pendingStore.isCurrent(pending) else { return false }
    if !pending.isCorrelated, let state = MobileAuthReturnParser.callbackState(url), handledAuthReturnStates.contains(state) {
      return false
    }
    if let providerError = MobileAuthReturnParser.parseProviderError(url) {
      guard pendingStore.matches(url, snapshot: pending, baseURL: appState.configuration.webBaseURL),
        shouldHandleMobileAuthProviderError(route: appState.route,
        hasPendingVerifier: pendingStore.hasCodeVerifier()) else {
        Observability.addBreadcrumb(.deepLinkParseFailed, level: .warning,
          context: ["reason": "provider_error_without_pending_auth"])
        return false
      }
      Observability.addBreadcrumb(.deepLinkRouteMatched, level: .warning,
        context: ["route": "auth_error", "url": url])
      presentUnprovenMobileAuthError(route: appState.route,
        hasFinalizeInFlight: authReturnSlot.task != nil) {
        authErrorMessage = providerError.userMessage
        MobileAuthDiagnostics.record("auth_callback_provider_error", detail: providerError.error)
#if DEBUG
        LiveAuthUITestStatus.set("error", error: providerError.userMessage)
#endif
      }
      return false
    }
    if let authReturn = pendingStore.claim(url, matching: pending, baseURL: appState.configuration.webBaseURL) {
      Observability.addBreadcrumb(.deepLinkRouteMatched, context: ["route": "auth_return", "url": url])
      handleAuthReturn(authReturn)
      return false
    }
    guard MobileAuthReturnParser.isCodeCallback(url) else {
      if let route = MobileSignedInLinkRoute.resolve(url) {
        Observability.addBreadcrumb(.deepLinkRouteMatched, context: ["route": route.rawValue, "url": url])
        IntentNavigationStore.shared.submit(route.intent)
      } else if MobileWebOnlyRouteBoundary.isWebOnly(url) {
        // JOV-7632: web-only workspaces stay out of iOS navigation. If a link
        // still reaches the app (stale AASA cache, older build), hand it back
        // to Safari instead of stranding the user in-app.
        Observability.addBreadcrumb(.deepLinkRouteMatched, context: ["route": "web_only", "url": url])
        let fallback = MobileWebOnlyRouteBoundary.webFallbackURL(
          for: url, webBaseURL: appState.configuration.webBaseURL
        )
        UIApplication.shared.open(fallback)
      } else {
        Observability.addBreadcrumb(.deepLinkRouteUnmatched, level: .warning, context: ["url": url])
        Observability.addBreadcrumb(.deepLinkParseFailed, level: .warning, context: ["url": url])
      }
      return false
    }
    if pending.isCorrelated { return false }
    guard isRetry else { return true }
    guard shouldSignOutAfterMissingVerifier(callbackState: MobileAuthReturnParser.callbackState(url),
      handledStates: handledAuthReturnStates, hasFinalizeInFlight: isAuthFinalizeInFlight(for: url),
      hasStoredSession: NativeSessionTokenStore.load() != nil) else { return false }
    Observability.addBreadcrumb(.deepLinkParseFailed, level: .warning,
      context: ["reason": "missing_pending_verifier", "url": url])
    presentUnprovenMobileAuthError(route: appState.route,
      hasFinalizeInFlight: authReturnSlot.task != nil) {
      authErrorMessage = MobileAuthCopy.failure
      MobileAuthDiagnostics.record("auth_callback_missing_verifier")
#if DEBUG
      LiveAuthUITestStatus.set("error", error: "Missing pending native auth code verifier.")
#endif
    }
    return false
  }

#if DEBUG
  func handleLaunchInputOnce(verifier: String?, nativeAttempt: String? = nil, callbackURL: URL?) {
    guard appState.launchMode == .uiTestingLiveAuth, !didHandleLaunchAuthCallback else { return }
    didHandleLaunchAuthCallback = true
    if let verifier, let nativeAttempt {
      LiveAuthUITestStatus.set("waiting")
      pendingStore.save(codeVerifier: verifier, nativeAttempt: nativeAttempt,
        baseURL: appState.configuration.webBaseURL)
    }
    if let callbackURL { handleAuthReturn(callbackURL) }
  }
#endif

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
  private func handleAuthReturn(_ claim: MobileAuthPendingStore.Claim) {
    guard pendingStore.isCurrent(claim) else { return }
    let authReturn = claim.authReturn
    acceptedPending = pendingStore.snapshot()
    handledAuthReturnStates.insert(authReturn.state)
    startedAuthFinalizeStates.insert(authReturn.state)
    retireBrowserProducer()
    isOpening = false

    let attempt = NativeSessionTokenStore.beginAuthAttempt()
    appState.acceptAuthAttempt(attempt)
    authErrorMessage = nil
    MobileAuthDiagnostics.record("auth_finalization_started")
#if DEBUG
    LiveAuthUITestStatus.set("exchanging")
#endif
    let appState = appState
    let slot = authReturnSlot
    let exchange = exchange
    let pendingStore = pendingStore
    authReturnSlot.install(attempt) { [weak self, weak slot] in
      let span = Observability.startSpan(name: .nativeAuthExchangeStarted,
        context: ["stage": "native_auth_return"])
      defer { pendingStore.finish(claim); span.finish(); slot?.release(attempt) }
      await finalizeMobileAuthAttempt(attempt, exchange: {
        Observability.addBreadcrumb(.nativeAuthExchangeStarted,
          context: ["stage": "native_auth_return"])
        return try await exchange(authReturn)
      }, reconcile: { result, error in
        appState.reconcileAuth(result) {
          // Only an explicit pre-consume rejection can reopen this exact claim.
          if let error, isPreconsumeMobileAuthRejection(error), pendingStore.rearm(claim),
             let nonce = authReturn.nativeAttempt {
            MobileAuthCallbackURLInbox.shared.allowRetry(nativeAttempt: nonce)
            self?.acceptedPending = pendingStore.snapshot()
            self?.handledAuthReturnStates.remove(authReturn.state)
            self?.startedAuthFinalizeStates.remove(authReturn.state)
            self?.seenAuthCallbackURLs = self?.seenAuthCallbackURLs.filter {
              guard let url = URL(string: $0) else { return true }
              return MobileAuthReturnParser.nativeAttempt(url) != nonce
            } ?? []
          }
          guard slot?.attempt == attempt, let self, let owned = self.acceptedPending,
                pendingStore.isCurrent(owned) else { return }
          if result.outcome == .persisted {
            MobileAuthDiagnostics.record("native_exchange_session_token_received")
            Observability.addBreadcrumb(.nativeAuthExchangeSucceeded,
              context: ["stage": "native_session_token"])
            Observability.addBreadcrumb(.nativeSessionPersisted)
          } else if let error { self.publishAuthFailure(error) }
        }
      }, failure: { cleanup, error in
        appState.reconcileAuthFailure(cleanup) { completion in
          NativeSessionTokenStore.performIfCurrent(completion) {
            guard slot?.attempt == attempt, pendingStore.isCurrent(claim), let self else { return }
            self.publishAuthFailure(error)
          }
        }
      }, settled: { result in
        NativeSessionTokenStore.performIfCurrent(result) {
          guard slot?.attempt == attempt, let self, let owned = self.acceptedPending,
                pendingStore.isCurrent(owned) else { return }
#if DEBUG
          if self.authErrorMessage == nil, let userID = appState.activeUserID {
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

  func presentationAnchor(
    for session: ASWebAuthenticationSession
  ) -> ASPresentationAnchor {
    if let window = MobileAuthPresentationWindows.selectedWindow() {
      return window
    }

    // Prefer any scene-attached window over a detached dummy window. ASWebAuthenticationSession
    // Code 3 fires when the returned window's scene is missing or not foreground-active.
    if let window = MobileAuthPresentationWindows.attachedWindows().first {
      return window
    }

    return MobileAuthPresentationAnchor.current() ?? ASPresentationAnchor()
  }

  fileprivate static func waitForForegroundActivePresentationWindow() async {
    if MobileAuthPresentationWindows.selectedWindow() != nil {
      return
    }

    for _ in 0..<40 {
      try? await Task.sleep(for: .milliseconds(50))
      if Task.isCancelled {
        return
      }
      if MobileAuthPresentationWindows.selectedWindow() != nil {
        return
      }
    }
  }

  fileprivate static func makeCodeVerifier() throws -> String {
    var bytes = [UInt8](repeating: 0, count: 64)
    let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    guard status == errSecSuccess else { throw MobileAuthCoordinatorError.randomGenerationFailed(status) }
    return Data(bytes).base64URLEncodedString()
  }

  fileprivate static func makeNativeAttempt() throws -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    guard status == errSecSuccess else { throw MobileAuthCoordinatorError.randomGenerationFailed(status) }
    return Data(bytes).base64URLEncodedString()
  }

  private static func makeCodeChallenge(verifier: String) -> String {
    let digest = SHA256.hash(data: Data(verifier.utf8))
    return Data(digest).base64URLEncodedString()
  }
}

func isAuthSessionCancellation(_ error: Error) -> Bool {
  if error is CancellationError {
    return true
  }

  if let error = error as? ASWebAuthenticationSessionError {
    return error.code == .canceledLogin
  }

  return false
}

func isAuthSessionPresentationContextInvalid(_ error: Error) -> Bool {
  if let error = error as? ASWebAuthenticationSessionError {
    return error.code == .presentationContextInvalid
  }

  let nsError = error as NSError
  return nsError.domain == ASWebAuthenticationSessionErrorDomain
    && nsError.code == ASWebAuthenticationSessionError.Code.presentationContextInvalid.rawValue
}

private extension String {
  var nilIfEmpty: String? {
    isEmpty ? nil : self
  }
}

private extension Data {
  func base64URLEncodedString() -> String {
    base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
