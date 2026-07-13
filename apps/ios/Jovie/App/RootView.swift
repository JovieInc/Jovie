import ClerkKit
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
  case clerkDidNotLoad
  case missingExchangeCredential
  case missingSessionToken(status: String, createdSessionID: String?, activeSessionID: String?, sessionCount: Int)
  case missingSignedInUser

  var errorDescription: String? {
    switch self {
    case .clerkDidNotLoad:
      "Clerk did not finish initializing before the native auth callback was handled."
    case .missingExchangeCredential:
      "The native auth exchange did not return a usable session credential."
    case let .missingSessionToken(status, createdSessionID, activeSessionID, sessionCount):
      "Clerk ticket sign-in completed without a session token. status=\(status) createdSessionID=\(createdSessionID ?? "nil") activeSessionID=\(activeSessionID ?? "nil") sessionCount=\(sessionCount)"
    case .missingSignedInUser:
      "You're signed in, but we couldn't load your profile. Try again."
    }
  }
}

private struct MobileAuthFinalizationStageError: LocalizedError {
  let stage: String
  let underlyingError: Error

  var errorDescription: String? {
    let message = underlyingError.localizedDescription.isEmpty
      ? String(describing: underlyingError)
      : underlyingError.localizedDescription
    return "Native auth \(stage) failed: \(message)"
  }
}

@MainActor
private func runMobileAuthFinalizationStage<Value>(
  _ stage: String,
  operation: () async throws -> Value
) async throws -> Value {
  do {
    return try await operation()
  } catch {
    throw MobileAuthFinalizationStageError(
      stage: stage,
      underlyingError: error
    )
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

    let preparedSignIn: SignIn
    do {
      preparedSignIn = try await Clerk.shared.auth.signInWithEmailCode(
        emailAddress: emailAddress
      )
    } catch {
      throw LiveAuthBootstrapError.bootstrapFailed(
        stage: "signInWithEmailCode",
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
      _ = try await NativeSessionTokenProvider().bearerToken(forceRefresh: false)
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
  let isAuthAvailable: Bool
  let isSignInUnavailable: Bool
  let authErrorMessage: String?
  let onLogout: @MainActor () async -> Void
  let onAuthReturn: @MainActor (MobileAuthReturn) -> Void
  let onAuthError: @MainActor (String?) -> Void
  @State private var chatRepository: ChatRepository?
  @State private var chatDraft = ""
  @State private var audienceHighlightsState: AudienceHighlightsLoadState
  @State private var calendarResponse: MobileActionLoopCalendarResponse?
  @State private var inboxResponse: MobileActionLoopInboxResponse?
  @State private var isLoadingCalendar = false
  @State private var isLoadingInbox = false

  init(
    appState: AppState,
    isAuthAvailable: Bool,
    isSignInUnavailable: Bool,
    authErrorMessage: String?,
    onLogout: @escaping @MainActor () async -> Void,
    onAuthReturn: @escaping @MainActor (MobileAuthReturn) -> Void,
    onAuthError: @escaping @MainActor (String?) -> Void
  ) {
    self.appState = appState
    self.isAuthAvailable = isAuthAvailable
    self.isSignInUnavailable = isSignInUnavailable
    self.authErrorMessage = authErrorMessage
    self.onLogout = onLogout
    self.onAuthReturn = onAuthReturn
    self.onAuthError = onAuthError
    _audienceHighlightsState = State(
      initialValue: Self.previewAudienceHighlightsState(for: appState.launchMode)
    )
  }

  private static func previewAudienceHighlightsState(
    for launchMode: LaunchMode
  ) -> AudienceHighlightsLoadState {
    switch launchMode {
    case .uiTestingAudience,
         .uiTestingReady,
         .uiTestingChat,
         .uiTestingChatEntityFixture,
         .uiTestingSettings,
         .uiTestingVenueMode:
      return .loaded(.preview)
    default:
      return .idle
    }
  }

  var body: some View {
    Group {
      switch appState.route {
      case .launching:
        SplashView()
          .transition(.opacity)
      case .signedOut:
        AuthScreen(
          isMock: !isAuthAvailable,
          isSignInUnavailable: isSignInUnavailable,
          webBaseURL: appState.configuration.webBaseURL,
          errorMessage: authErrorMessage,
          onAuthReturn: onAuthReturn,
          onAuthError: onAuthError
        )
        .transition(.opacity)
      case .needsOnboarding:
        AppShellView(
          profile: AppShellProfile(response: appState.loadedDashboardResponse),
          isOffline: false,
          initialTab: .profile,
          opensSettingsOnLaunch: appState.launchMode.opensSettingsOnLaunch,
          billingURL: appState.billingURL,
          chatEnabled: false,
          audienceEnabled: false,
          recentConversations: chatRepository?.conversations ?? [],
          activeConversationID: chatRepository?.activeConversationID,
          onSelectConversation: { conversationID in
            Task { await chatRepository?.openConversation(conversationID) }
          },
          onStartNewChat: {
            chatRepository?.startNewConversation()
          },
          onAutoSendMessage: handleAutoSendMessage,
          onLogout: onLogout
        ) {
          NeedsOnboardingView(continueURL: appState.continueOnWebURL)
        } audienceContent: { _ in
          EmptyView()
        } libraryContent: { _ in
          EmptyView()
        } calendarContent: { _ in
          EmptyView()
        } inboxContent: { _ in
          EmptyView()
        } chatContent: { draft, voiceCaptureTrigger, _ in
          if let chatRepository {
            MobileChatView(
              repository: chatRepository,
              draft: draft,
              voiceCaptureTrigger: voiceCaptureTrigger,
              webBaseURL: appState.configuration.webBaseURL
            )
          } else {
            MobileChatPlaceholderView(isOffline: false, draft: draft)
          }
        }
        .transition(.opacity)
      case .ready:
        AppShellView(
          profile: AppShellProfile(response: appState.loadedDashboardResponse),
          isOffline: appState.isOffline,
          initialTab: appState.launchMode.opensAudienceOnLaunch
            ? .audience
            : (appState.launchMode.opensChatOnLaunch ? .chat : appState.launchMode.defaultInitialTab),
          opensSettingsOnLaunch: appState.launchMode.opensSettingsOnLaunch,
          billingURL: appState.billingURL,
          chatEnabled: appState.loadedDashboardResponse != nil,
          audienceEnabled: appState.loadedDashboardResponse != nil,
          recentConversations: chatRepository?.conversations ?? [],
          activeConversationID: chatRepository?.activeConversationID,
          onSelectConversation: { conversationID in
            Task { await chatRepository?.openConversation(conversationID) }
          },
          onStartNewChat: {
            chatRepository?.startNewConversation()
          },
          onAutoSendMessage: handleAutoSendMessage,
          onLogout: onLogout
        ) {
          DashboardView(
            state: appState.dashboardState,
            brightnessManager: appState.brightnessManager,
            showVenueModeOnLaunch: appState.launchMode.opensVenueModeOnLaunch,
            loadAppleWalletProfilePass: {
              try await APIClient(
                baseURL: appState.configuration.apiBaseURL,
                tokenProvider: NativeSessionTokenProvider()
              ).fetchAppleWalletProfilePass()
            },
            onRetry: { await appState.retry() }
          )
        } audienceContent: { askJovie in
          AudienceHighlightsView(
            state: audienceHighlightsState,
            isOffline: appState.isOffline,
            onRetry: { await reloadAudienceHighlights(for: appState.activeUserID) },
            onAskJovie: askJovie
          )
        } libraryContent: { onSelectAsset in
          LibrarySurfaceView(
            assets: LibraryFeed.previewAssets,
            onSelectAsset: onSelectAsset
          )
        } calendarContent: { askJovie in
          CalendarSurfaceView(
            response: calendarResponse ?? (usesPreviewActionLoops ? .preview : nil),
            isLoading: isLoadingCalendar && calendarResponse == nil,
            isOffline: appState.isOffline,
            onRetry: { await reloadActionLoops(for: appState.activeUserID) },
            onAskJovie: askJovie
          )
        } inboxContent: { askJovie in
          InboxSurfaceView(
            response: inboxResponse ?? (usesPreviewActionLoops ? .preview : nil),
            isLoading: isLoadingInbox && inboxResponse == nil,
            isOffline: appState.isOffline,
            onRetry: { await reloadActionLoops(for: appState.activeUserID) },
            onAskJovie: askJovie
          )
        } chatContent: { draft, voiceCaptureTrigger, onEntityTap in
          if let chatRepository {
            MobileChatView(
              repository: chatRepository,
              draft: draft,
              voiceCaptureTrigger: voiceCaptureTrigger,
              webBaseURL: appState.configuration.webBaseURL,
              onEntityTap: onEntityTap
            )
          } else {
            MobileChatPlaceholderView(isOffline: appState.isOffline, draft: draft)
          }
        }
        .transition(.opacity)
      }
    }
    // Cross-fade between top-level routes (notably splash → app) so the first
    // content paint feels intentional rather than a hard cut. Opacity-only, so
    // no layout shift and no decorative spatial motion.
    .animation(JovieMotion.easeOut(duration: JovieMotion.slowDuration), value: appState.route)
    .task(id: "\(appState.route)-\(appState.launchMode)") {
      guard appState.route == .ready else { return }
      await reloadAudienceHighlights(for: appState.activeUserID)
      await reloadActionLoops(for: appState.activeUserID)
    }
    .task(id: appState.activeUserID) {
      guard let activeUserID = appState.activeUserID else {
        chatRepository = nil
        if Self.previewAudienceHighlightsState(for: appState.launchMode) == .idle {
          audienceHighlightsState = .idle
        }
        return
      }

      if appState.launchMode == .uiTestingAuthCallback {
        chatRepository = nil
        audienceHighlightsState = .loaded(.preview)
        return
      }

      if chatRepository == nil, appState.launchMode.needsChatRepository {
        let repository = ChatRepository(
          client: MobileChatClient(
            baseURL: appState.configuration.apiBaseURL,
            tokenProvider: NativeSessionTokenProvider()
          ),
          cache: ChatCache(),
          clerkUserID: activeUserID,
          webBaseURL: appState.configuration.webBaseURL
        )
        chatRepository = repository

        if let fixtureTimeline = appState.launchMode.chatEntityFixture {
          // Deterministic UI-testing fixture (JOV-3608): bypasses the network
          // client/cache entirely so entity/skill chip rendering can be
          // asserted without a mocked backend.
          repository.seedTimelineForUITesting(
            fixtureTimeline,
            activeConversationID: MobileChatEntityFixture.conversationID
          )
        } else {
          Task { await repository.bootstrap() }
        }
      }

      await reloadAudienceHighlights(for: activeUserID)
    }
  }

  private func handleAutoSendMessage(_ text: String) {
    Task { await chatRepository?.send(text: text) }
  }

  private var usesPreviewActionLoops: Bool {
    switch appState.launchMode {
    case .uiTestingAudience,
         .uiTestingReady,
         .uiTestingChat,
         .uiTestingChatOffline,
         .uiTestingChatEntityFixture,
         .uiTestingSettings,
         .uiTestingVenueMode,
         .uiTestingAuthCallback:
      return true
    default:
      return !appState.launchMode.usesLiveClerk
    }
  }

  @MainActor
  private func reloadActionLoops(for userID: String?) async {
    if usesPreviewActionLoops {
      calendarResponse = .preview
      inboxResponse = .preview
      isLoadingCalendar = false
      isLoadingInbox = false
      return
    }

    guard let userID, appState.route == .ready else {
      calendarResponse = nil
      inboxResponse = nil
      return
    }

    _ = userID
    let client = APIClient(
      baseURL: appState.configuration.apiBaseURL,
      tokenProvider: NativeSessionTokenProvider()
    )

    isLoadingCalendar = calendarResponse == nil
    isLoadingInbox = inboxResponse == nil

    do {
      calendarResponse = try await client.fetchActionLoopCalendar()
    } catch {
      // Keep stale calendar if revalidation fails.
    }
    isLoadingCalendar = false

    do {
      inboxResponse = try await client.fetchActionLoopInbox()
    } catch {
      // Keep stale inbox if revalidation fails.
    }
    isLoadingInbox = false
  }

  @MainActor
  private func reloadAudienceHighlights(for userID: String?) async {
    guard appState.launchMode.usesLiveClerk else {
      audienceHighlightsState = Self.previewAudienceHighlightsState(for: appState.launchMode)
      return
    }

    if appState.launchMode == .uiTestingAudience
      || appState.launchMode == .uiTestingReady
      || appState.launchMode == .uiTestingChat
      || appState.launchMode == .uiTestingAuthCallback
      || appState.launchMode == .uiTestingChatEntityFixture
      || appState.launchMode == .uiTestingSettings
      || appState.launchMode == .uiTestingVenueMode
    {
      audienceHighlightsState = .loaded(.preview)
      return
    }

    guard let userID else {
      audienceHighlightsState = .idle
      return
    }

    audienceHighlightsState = .loading

    let repository = AudienceHighlightsRepository(
      apiClient: APIClient(
        baseURL: appState.configuration.apiBaseURL,
        tokenProvider: NativeSessionTokenProvider()
      )
    )

    do {
      let result = try await repository.load(for: userID)
      audienceHighlightsState = .loaded(result.response)
    } catch {
      audienceHighlightsState = .error("Couldn't load audience highlights.")
    }
  }
}


struct RootView: View {
  @Bindable var appState: AppState
  let isAuthAvailable: Bool
  let isSignInUnavailable: Bool
  let liveUserID: String?
  let authErrorMessage: String?
  let onLogout: @MainActor () async -> Void
  let onAuthReturn: @MainActor (MobileAuthReturn) -> Void
  let onAuthError: @MainActor (String?) -> Void

  var body: some View {
    ZStack {
      AppContentView(
        appState: appState,
        isAuthAvailable: isAuthAvailable,
        isSignInUnavailable: isSignInUnavailable,
        authErrorMessage: authErrorMessage,
        onLogout: onLogout,
        onAuthReturn: onAuthReturn,
        onAuthError: onAuthError
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

        if appState.launchMode == .uiTestingAuthCallback, liveUserID == nil {
          return
        }

        if let liveUserID, appState.activeUserID == liveUserID {
          return
        }

        await appState.handleSignedInUserChange(liveUserID)
      }
  }
}

struct LiveRootContainer: View {
  @Environment(Clerk.self) private var clerk
  @Bindable var appState: AppState
  @State private var didBootstrapLiveAuth = false
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
      liveUserID: clerk.user?.id,
      authErrorMessage: authErrorMessage,
      onLogout: {
        try? await clerk.auth.signOut()
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
      .task(id: appState.didLoadClerk) {
        guard appState.didLoadClerk,
              didHydrateNativeSession == false,
              clerk.user == nil,
              let nativeSession = NativeSessionTokenStore.load()
        else {
          return
        }

        didHydrateNativeSession = true
        MobileAuthDiagnostics.record("native_session_hydrated")
        await appState.handleSignedInUserChange(nativeSession.userID)
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
      .task(id: appState.launchMode.requiresAutoAuth) {
        guard appState.launchMode.requiresAutoAuth, didBootstrapLiveAuth == false else {
          return
        }

        didBootstrapLiveAuth = true

        do {
#if DEBUG
          LiveAuthUITestStatus.set("starting")
#endif
          let userID = try await LiveAuthBootstrapper.signInFromEnvironment()
          Observability.addBreadcrumb(
            .clerkSessionExchangeSucceeded,
            context: ["stage": "live_auth_bootstrap"]
          )
          await appState.handleSignedInUserChange(userID)

#if DEBUG
          LiveAuthUITestStatus.setRouteStatus(appState.route, userID: userID)
#endif
        } catch {
          Observability.addBreadcrumb(
            .clerkSessionExchangeFailed,
            level: .error,
            context: observabilityFailureContext(
              stage: "live_auth_bootstrap",
              error: error
            )
          )
          Observability.captureError(
            error,
            event: .clerkSessionExchangeFailed,
            context: observabilityFailureContext(
              stage: "live_auth_bootstrap",
              error: error
            )
          )
#if DEBUG
          LiveAuthUITestStatus.set(
            "error",
            error: error.localizedDescription.isEmpty
              ? "Live auth bootstrap failed."
              : error.localizedDescription
          )
#endif
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
        Observability.addBreadcrumb(
          .deepLinkRouteMatched,
          level: .warning,
          context: ["route": "auth_error", "url": url]
        )
        authReturnTask?.cancel()
        authReturnTask = nil
        await appState.signOut()
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
    NativeTicketSignInDiagnostics.clear()
    LiveAuthUITestStatus.set("exchanging")
#endif

    authReturnTask = Task { @MainActor in
      let span = Observability.startSpan(
        name: .clerkSessionExchangeStarted,
        context: ["stage": "native_auth_return"]
      )
      defer {
        span.finish()
        authReturnTask = nil
      }

      do {
        Observability.addBreadcrumb(
          .clerkSessionExchangeStarted,
          context: ["stage": "native_auth_return"]
        )
        let exchangeResponse = try await runMobileAuthFinalizationStage("exchange") {
          try await NativeAuthExchangeClient(
            baseURL: appState.configuration.webBaseURL
          ).exchange(authReturn)
        }
        Observability.addBreadcrumb(
          .clerkSessionExchangeSucceeded,
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
            .clerkSessionExchangeSucceeded,
            context: ["stage": "native_session_token"]
          )
          Observability.addBreadcrumb(.nativeSessionPersisted)
          await appState.handleSignedInUserChange(userID)
#if DEBUG
          LiveAuthUITestStatus.setRouteStatus(appState.route, userID: userID)
#endif
          return
        }

        // MobileAuthFinalizationPlan is now exhaustive under Better Auth
        // (plan decision 9 — the `requiresClerkTicketFlow` case is deleted).
        // The control-flow reachability here is impossible; the switch above
        // returns on the only case. The code below is unreachable but kept
        // for defensive clarity until the next-purge commit removes it.
        throw MobileAuthReturnError.missingExchangeCredential
      } catch {
        guard !(error is CancellationError), !Task.isCancelled else {
          return
        }

        let context = observabilityFailureContext(
          stage: "native_auth_return",
          error: error
        )
        Observability.addBreadcrumb(
          .clerkSessionExchangeFailed,
          level: .error,
          context: context
        )
        Observability.captureError(
          error,
          event: .clerkSessionExchangeFailed,
          context: context
        )

        if error is MobileAuthReturnError {
          // Clerk → Better Auth migration: `clerk.auth.signOut()` is gone.
          // `appState.signOut()` clears Keychain + state, which is the
          // complete signed-out transition under BA.
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

private extension AppState {
  var loadedDashboardResponse: MobileMeResponse? {
    guard case let .loaded(response) = dashboardState else {
      return nil
    }

    return response
  }
}
