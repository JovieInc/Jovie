import Observation
import SwiftUI


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
  @State private var showWhatsNew = false
  @AppStorage("jovie.whatsNew.lastPresentedVersion") private var lastPresentedWhatsNewVersion: String?

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
    .sheet(isPresented: $showWhatsNew, onDismiss: markWhatsNewPresented) {
      JovieWhatsNewView(version: currentAppVersion)
    }
    .task(id: "\(appState.route)-\(appState.launchMode)") {
      guard appState.route == .ready else { return }
      showWhatsNew = WhatsNewPresentationPolicy.shouldPresent(
        currentVersion: currentAppVersion,
        lastPresentedVersion: lastPresentedWhatsNewVersion,
        isEligible: appState.activeUserID != nil
      )
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

  private var currentAppVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
  }

  private func markWhatsNewPresented() {
    lastPresentedWhatsNewVersion = currentAppVersion
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

struct WhatsNewPresentationPolicy {
  static func shouldPresent(
    currentVersion: String,
    lastPresentedVersion: String?,
    isEligible: Bool
  ) -> Bool {
    isEligible && currentVersion != lastPresentedVersion
  }
}

private struct JovieWhatsNewView: View {
  let version: String
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.large) {
      HStack {
        VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
          Text("What’s New")
            .font(JovieFont.display(size: 24))
            .foregroundStyle(JovieColor.textPrimary)
          Text("Version \(version)")
            .font(JovieFont.body(size: 14))
            .foregroundStyle(JovieColor.textTertiary)
        }
        Spacer()
        Image(systemName: "sparkles")
          .font(.title2)
          .foregroundStyle(JovieColor.accent)
          .accessibilityHidden(true)
      }

      VStack(alignment: .leading, spacing: JovieSpacing.medium) {
        Label("This update is shown once for this app version.", systemImage: "checkmark.circle")
        Label("Dismiss it anytime with Done.", systemImage: "hand.tap")
      }
      .font(JovieFont.body(size: 16))
      .foregroundStyle(JovieColor.textSecondary)

      Spacer(minLength: 0)

      Button("Done") {
        dismiss()
      }
        .buttonStyle(JoviePillButtonStyle(filled: true))
        .accessibilityIdentifier("whats-new-done")
    }
    .padding(JovieSpacing.large)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(JovieColor.backgroundBase)
    .presentationDetents([.medium])
    .presentationDragIndicator(.visible)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("What’s New, version \(version)")
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
