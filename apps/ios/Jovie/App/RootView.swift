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
  @State private var workspaceMode: MobileWorkspaceMode = .jovie
  @State private var showWhatsNew = false
#if DEBUG
  @State private var didSendLiveChatProbe = false
#endif
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

#if DEBUG
  private func liveChatSendPrompt() -> String? {
    if let value = ProcessInfo.processInfo.environment["JOVIE_IOS_LIVE_CHAT_PROMPT"] {
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty {
        return trimmed
      }
    }

    return nil
  }
#endif

  private static func previewAudienceHighlightsState(
    for launchMode: LaunchMode
  ) -> AudienceHighlightsLoadState {
    switch launchMode {
    case .uiTestingAudience,
         .uiTestingReady,
         .uiTestingChat,
         .uiTestingChatEntityFixture,
         .uiTestingChatAllComponents,
         .uiTestingSettings,
         .uiTestingVenueMode,
         .uiTestingLibrary,
         .uiTestingLibraryEmpty,
         .uiTestingInbox,
         .uiTestingInboxOffline,
         .uiTestingCalendar,
         .uiTestingCalendarOffline:
      return .loaded(.preview)
    default:
      return .idle
    }
  }

  private static func previewLibraryAssets(for launchMode: LaunchMode) -> [LibraryAsset] {
    launchMode.usesEmptyLibraryPreview ? [] : LibraryFeed.previewAssets
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
          webBaseURL: appState.configuration.webBaseURL,
          accountURL: appState.accountURL,
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
          onLogout: onLogout,
          showsWorkspaceSwitch: showsWorkspaceSwitch,
          workspaceMode: workspaceMode,
          onSelectWorkspace: selectWorkspace
        ) {
          NeedsOnboardingView(
            initialDisplayName: appState.loadedDashboardResponse?.displayName ?? "",
            initialUsername: appState.loadedDashboardResponse?.username ?? "",
            onComplete: { displayName, username in
              if appState.launchMode == .uiTestingNeedsOnboardingUnauthorized {
                await appState.handleExpiredSession()
                return nil
              }

              if appState.launchMode == .uiTestingNeedsOnboarding {
                return "Profile completion is temporarily unavailable. Try again."
              }

              do {
                try await APIClient(
                  baseURL: appState.configuration.apiBaseURL,
                  tokenProvider: NativeSessionTokenProvider()
                ).completeProfile(displayName: displayName, username: username)
                await appState.retry()
                guard appState.route == .ready else {
                  return "Your profile was saved, but the app couldn't refresh it. Try again."
                }
                return nil
              } catch APIClientError.missingToken,
                      APIClientError.requestFailed(statusCode: 401)
              {
                await appState.handleExpiredSession()
                return nil
              } catch {
                return error.localizedDescription
              }
            }
          )
        } audienceContent: { _ in
          EmptyView()
        } libraryContent: { _, _ in
          EmptyView()
        } calendarContent: { _ in
          EmptyView()
        } inboxContent: { _ in
          EmptyView()
        } chatContent: { draft, voiceCaptureTrigger, _, _ in
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
      case .waitlistPending:
        WaitlistPendingView(onUseDifferentAccount: onLogout)
          .transition(.opacity)
      case .ready:
        AppShellView(
          profile: AppShellProfile(response: appState.loadedDashboardResponse),
          isOffline: appState.isOffline,
          initialTab: appState.launchMode.opensAudienceOnLaunch
            ? .audience
            : (appState.launchMode.opensChatOnLaunch ? .chat : appState.launchMode.defaultInitialTab),
          opensSettingsOnLaunch: appState.launchMode.opensSettingsOnLaunch,
          webBaseURL: appState.configuration.webBaseURL,
          accountURL: appState.accountURL,
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
          onLogout: onLogout,
          showsWorkspaceSwitch: showsWorkspaceSwitch,
          workspaceMode: workspaceMode,
          onSelectWorkspace: selectWorkspace
        ) {
          DashboardView(
            state: appState.dashboardState,
            brightnessManager: appState.brightnessManager,
            webBaseURL: appState.configuration.webBaseURL,
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
        } libraryContent: { onSelectAsset, home in
          LibrarySurfaceView(
            assets: Self.previewLibraryAssets(for: appState.launchMode),
            home: home,
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
            response: inboxResponse ?? (usesPreviewActionLoops && workspaceMode == .jovie ? .preview : nil),
            isLoading: isLoadingInbox && inboxResponse == nil,
            isOffline: appState.isOffline,
            workspaceMode: workspaceMode,
            onRetry: { await reloadActionLoops(for: appState.activeUserID) },
            onAskJovie: askJovie
          )
        } chatContent: { draft, voiceCaptureTrigger, onEntityTap, onRecordVideo in
          if let chatRepository {
            MobileChatView(
              repository: chatRepository,
              draft: draft,
              voiceCaptureTrigger: voiceCaptureTrigger,
              webBaseURL: appState.configuration.webBaseURL,
              onEntityTap: onEntityTap,
              onRecordVideo: onRecordVideo
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
      JovieWhatsNewView(
        version: currentAppVersion,
        items: WhatsNewCatalog.items(for: currentAppVersion)
      )
    }
    .task(id: "\(appState.route)-\(appState.launchMode)-\(appState.activeUserID ?? "")-\(workspaceMode.rawValue)") {
      guard appState.route == .ready else { return }
      // Live What’s New is FeatureIntro in chat. The versioned sheet is the
      // UITest fixture so chat-first cases can name what to tap.
      if appState.launchMode == .uiTestingWhatsNew {
        showWhatsNew = true
      }
      await reloadAudienceHighlights(for: appState.activeUserID)
      await reloadActionLoops(for: appState.activeUserID)
    }
    .task(id: "\(appState.activeUserID ?? "")-\(workspaceMode.rawValue)-\(showsWorkspaceSwitch)") {
      let resolved = MobileWorkspaceStore.load(isAdmin: showsWorkspaceSwitch)
      if workspaceMode != resolved {
        workspaceMode = resolved
        inboxResponse = nil
      }

      guard let activeUserID = appState.activeUserID else {
        chatRepository = nil
        if Self.previewAudienceHighlightsState(for: appState.launchMode) == .idle {
          audienceHighlightsState = .idle
        }
        calendarResponse = nil
        inboxResponse = nil
        return
      }

      if appState.launchMode == .uiTestingAuthCallback {
        chatRepository = nil
        audienceHighlightsState = .loaded(.preview)
        return
      }

      if appState.launchMode.needsChatRepository,
         chatRepository == nil || chatRepository?.workspace != workspaceMode
      {
        let repository = makeChatRepository(userID: activeUserID)
        chatRepository = repository

        if let fixtureTimeline = appState.launchMode.chatEntityFixture {
          // Deterministic UI-testing fixture: bypasses the network
          // client/cache entirely so parse→render can be asserted without a
          // mocked backend.
          repository.seedTimelineForUITesting(
            fixtureTimeline,
            activeConversationID: appState.launchMode.chatFixtureConversationID
              ?? MobileChatEntityFixture.conversationID
          )
        } else {
          Task { await repository.bootstrap() }
        }
      }

#if DEBUG
      if appState.launchMode.usesLiveAuth,
         appState.route == .ready,
         didSendLiveChatProbe == false,
         let prompt = liveChatSendPrompt(),
         let repository = chatRepository
      {
        didSendLiveChatProbe = true
        Task { await repository.send(text: prompt) }
      }
#endif
    }
    .task(id: chatRepository?.sessionExpired) {
      guard chatRepository?.sessionExpired == true else { return }
      await appState.handleExpiredSession()
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

  private var showsWorkspaceSwitch: Bool {
    appState.loadedDashboardResponse?.showsAdminWorkspaceSwitch == true
  }

  private func selectWorkspace(_ mode: MobileWorkspaceMode) {
    guard showsWorkspaceSwitch else { return }
    MobileWorkspaceStore.save(mode, isAdmin: true)
    workspaceMode = mode
    inboxResponse = nil
  }

  private func makeChatRepository(userID: String) -> ChatRepository {
    ChatRepository(
      client: MobileChatClient(
        baseURL: appState.configuration.apiBaseURL,
        tokenProvider: NativeSessionTokenProvider(),
        workspace: workspaceMode
      ),
      cache: ChatCache(),
      userID: userID,
      webBaseURL: appState.configuration.webBaseURL,
      workspace: workspaceMode
    )
  }

  private var usesPreviewActionLoops: Bool {
    if appState.launchMode.holdsActionLoopLoading {
      return false
    }

    switch appState.launchMode {
    case .uiTestingAudience,
         .uiTestingReady,
         .uiTestingChat,
         .uiTestingChatOffline,
         .uiTestingChatEntityFixture,
         .uiTestingChatAllComponents,
         .uiTestingSettings,
         .uiTestingVenueMode,
         .uiTestingAuthCallback,
         .uiTestingLibrary,
         .uiTestingLibraryEmpty,
         .uiTestingInbox,
         .uiTestingInboxOffline,
         .uiTestingCalendar,
         .uiTestingCalendarOffline:
      return true
    default:
      return !appState.launchMode.usesLiveAuth
    }
  }

  @MainActor
  private func reloadActionLoops(for userID: String?) async {
    if appState.launchMode.holdsActionLoopLoading {
      calendarResponse = nil
      inboxResponse = nil
      isLoadingCalendar = appState.launchMode == .uiTestingCalendarLoading
      isLoadingInbox = appState.launchMode == .uiTestingInboxLoading
      return
    }

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

    let cache = ActionLoopCache()
    if calendarResponse == nil {
      calendarResponse = await cache.loadCalendar(for: userID)
    }
    if inboxResponse == nil {
      inboxResponse = await cache.loadInbox(for: userID, workspace: workspaceMode)
    }

    let client = APIClient(
      baseURL: appState.configuration.apiBaseURL,
      tokenProvider: NativeSessionTokenProvider()
    )

    isLoadingCalendar = calendarResponse == nil
    isLoadingInbox = inboxResponse == nil

    async let fetchedCalendar = client.fetchActionLoopCalendar()
    async let fetchedInbox = client.fetchActionLoopInbox(workspace: workspaceMode)

    if let calendar = try? await fetchedCalendar {
      calendarResponse = calendar
      await cache.storeCalendar(calendar, for: userID)
    }
    isLoadingCalendar = false

    if let inbox = try? await fetchedInbox {
      inboxResponse = inbox
      await cache.storeInbox(inbox, for: userID, workspace: workspaceMode)
    }
    isLoadingInbox = false
  }

  @MainActor
  private func reloadAudienceHighlights(for userID: String?) async {
    guard appState.launchMode.usesLiveAuth else {
      audienceHighlightsState = Self.previewAudienceHighlightsState(for: appState.launchMode)
      return
    }

    if appState.launchMode == .uiTestingAudience
      || appState.launchMode == .uiTestingReady
      || appState.launchMode == .uiTestingChat
      || appState.launchMode == .uiTestingAuthCallback
      || appState.launchMode == .uiTestingChatEntityFixture
      || appState.launchMode == .uiTestingChatAllComponents
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

    let repository = AudienceHighlightsRepository(
      apiClient: APIClient(
        baseURL: appState.configuration.apiBaseURL,
        tokenProvider: NativeSessionTokenProvider()
      ),
      cache: AudienceHighlightsCache()
    )

    if let cached = await repository.cachedSnapshot(for: userID) {
      audienceHighlightsState = .loaded(cached)
    } else if audienceHighlightsShouldShowLoading(current: audienceHighlightsState) {
      audienceHighlightsState = .loading
    }

    do {
      let result = try await repository.load(for: userID)
      audienceHighlightsState = .loaded(result.response)
    } catch {
      if case .loaded = audienceHighlightsState {
        return
      }
      audienceHighlightsState = .error("Couldn't load audience highlights.")
    }
  }
}

private struct WaitlistPendingView: View {
  let onUseDifferentAccount: @MainActor () async -> Void
  @State private var isSwitchingAccount = false

  var body: some View {
    ZStack {
      JovieColor.backgroundBase.ignoresSafeArea()

      GeometryReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: JovieSpacing.large) {
            VStack(alignment: .leading, spacing: JovieSpacing.small) {
              Text("You're on the Waitlist")
                .font(.title.bold())
                .foregroundStyle(JovieColor.textPrimary)
                .accessibilityAddTraits(.isHeader)

              Text("This account doesn't have access yet. You can use a different account instead.")
                .font(.body)
                .foregroundStyle(JovieColor.textSecondary)
            }

            Button {
              guard !isSwitchingAccount else { return }
              isSwitchingAccount = true
              Task { await onUseDifferentAccount() }
            } label: {
              ZStack {
                Text(WaitlistPendingLayout.actionTitle(isSwitchingAccount: false))
                  .opacity(isSwitchingAccount ? 0 : 1)
                  .accessibilityHidden(isSwitchingAccount)

                HStack(spacing: JovieSpacing.small) {
                  ProgressView()
                    .tint(JovieColor.backgroundBase)
                  Text(WaitlistPendingLayout.actionTitle(isSwitchingAccount: true))
                }
                .opacity(isSwitchingAccount ? 1 : 0)
                .accessibilityHidden(!isSwitchingAccount)
              }
              .frame(maxWidth: .infinity)
              .frame(minHeight: WaitlistPendingLayout.reservedActionMinHeight)
            }
            .buttonStyle(JoviePillButtonStyle(filled: true))
            .disabled(isSwitchingAccount)
            .accessibilityIdentifier("waitlist-use-different-account")
          }
          .frame(maxWidth: WaitlistPendingLayout.maxContentWidth, alignment: .leading)
          .padding(JovieSpacing.xLarge)
          .frame(
            maxWidth: .infinity,
            minHeight: WaitlistPendingLayout.contentMinHeight(viewportHeight: proxy.size.height),
            alignment: .center
          )
        }
        .scrollBounceBehavior(.basedOnSize)
      }
    }
    .accessibilityIdentifier("waitlist-pending")
  }
}


/// Skip nil only when `LiveRootContainer` is mounted. The JovieApp fallback
/// still applies nil so an unavailable live build can leave `.launching`.
func shouldApplyAuthenticatedUserIDChange(
  launchMode _: LaunchMode,
  authenticatedUserID: String?,
  liveHydrateOwnsSession: Bool
) -> Bool {
  authenticatedUserID != nil || liveHydrateOwnsSession == false
}

func audienceHighlightsShouldShowLoading(current: AudienceHighlightsLoadState) -> Bool {
  if case .loaded = current {
    return false
  }
  return true
}

struct CachedActionLoopInboxSnapshot: Codable, Equatable, Sendable {
  let response: MobileActionLoopInboxResponse
  let cachedAt: Date
}

struct CachedActionLoopCalendarSnapshot: Codable, Equatable, Sendable {
  let response: MobileActionLoopCalendarResponse
  let cachedAt: Date
}

actor ActionLoopCache {
  private var inboxMemory: [String: CachedActionLoopInboxSnapshot] = [:]
  private var calendarMemory: [String: CachedActionLoopCalendarSnapshot] = [:]
  private let defaults: UserDefaults
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func loadInbox(
    for userID: String,
    workspace: MobileWorkspaceMode = .jovie
  ) -> MobileActionLoopInboxResponse? {
    let key = inboxCacheKey(for: userID, workspace: workspace)
    if let snapshot = inboxMemory[key] {
      return snapshot.response
    }

    guard
      let data = defaults.data(forKey: key),
      let snapshot = try? decoder.decode(CachedActionLoopInboxSnapshot.self, from: data)
    else {
      return nil
    }

    inboxMemory[key] = snapshot
    return snapshot.response
  }

  func storeInbox(
    _ response: MobileActionLoopInboxResponse,
    for userID: String,
    workspace: MobileWorkspaceMode = .jovie
  ) {
    let key = inboxCacheKey(for: userID, workspace: workspace)
    let snapshot = CachedActionLoopInboxSnapshot(response: response, cachedAt: Date())
    inboxMemory[key] = snapshot
    if let data = try? encoder.encode(snapshot) {
      defaults.set(data, forKey: key)
    }
  }

  func loadCalendar(for userID: String) -> MobileActionLoopCalendarResponse? {
    if let snapshot = calendarMemory[userID] {
      return snapshot.response
    }

    guard
      let data = defaults.data(forKey: calendarCacheKey(for: userID)),
      let snapshot = try? decoder.decode(CachedActionLoopCalendarSnapshot.self, from: data)
    else {
      return nil
    }

    calendarMemory[userID] = snapshot
    return snapshot.response
  }

  func storeCalendar(_ response: MobileActionLoopCalendarResponse, for userID: String) {
    let snapshot = CachedActionLoopCalendarSnapshot(response: response, cachedAt: Date())
    calendarMemory[userID] = snapshot
    if let data = try? encoder.encode(snapshot) {
      defaults.set(data, forKey: calendarCacheKey(for: userID))
    }
  }

  func remove(for userID: String) {
    calendarMemory[userID] = nil
    defaults.removeObject(forKey: calendarCacheKey(for: userID))
    removeInbox(for: userID, workspace: .jovie)
    removeInbox(for: userID, workspace: .ovie)
  }

  private func removeInbox(for userID: String, workspace: MobileWorkspaceMode) {
    let key = inboxCacheKey(for: userID, workspace: workspace)
    inboxMemory[key] = nil
    defaults.removeObject(forKey: key)
  }

  private func inboxCacheKey(
    for userID: String,
    workspace: MobileWorkspaceMode
  ) -> String {
    switch workspace {
    case .jovie:
      return "ie.jov.Jovie.actionLoopInbox.\(userID)"
    case .ovie:
      return "ie.jov.Jovie.actionLoopInbox.\(userID).ov"
    }
  }

  private func calendarCacheKey(for userID: String) -> String {
    "ie.jov.Jovie.actionLoopCalendar.\(userID)"
  }
}

struct RootView: View {
  @Bindable var appState: AppState
  let isAuthAvailable: Bool
  let isSignInUnavailable: Bool
  let authenticatedUserID: String?
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
      .task(id: "\(appState.didInitializeAuth)-\(authenticatedUserID ?? "signed-out")") {
        if appState.launchMode == .uiTestingAuthCallback, authenticatedUserID == nil {
          return
        }

        if let authenticatedUserID, appState.activeUserID == authenticatedUserID {
          return
        }

        guard shouldApplyAuthenticatedUserIDChange(
          launchMode: appState.launchMode,
          authenticatedUserID: authenticatedUserID,
          liveHydrateOwnsSession: isAuthAvailable && appState.launchMode.usesLiveAuth
        ) else {
          return
        }

        await appState.handleSignedInUserChange(authenticatedUserID)
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

struct WhatsNewItem: Equatable, Identifiable {
  let id: String
  let title: String
  let testHint: String
}

enum WhatsNewCatalog {
  static func items(for version: String) -> [WhatsNewItem] {
    switch version {
    case "1.0":
      return [
        WhatsNewItem(
          id: "chat-home",
          title: "Chat is home",
          testHint: "Open a signed-in session and confirm Ask Jovie is the first ready surface."
        ),
        WhatsNewItem(
          id: "swipe-shell",
          title: "Swipe sidebar and right rail",
          testHint: "Swipe from the leading edge to open the sidebar and from the trailing edge to open the right rail. Confirm there is no bottom tab bar."
        ),
        WhatsNewItem(
          id: "sidebar-destinations",
          title: "Library, Calendar, and Inbox live in the sidebar",
          testHint: "Open the sidebar and tap Library, Calendar, Inbox, Profile, Audience, and Talk. None of these should be bottom tabs."
        ),
        WhatsNewItem(
          id: "chat-quality",
          title: "Chat renders labels, not markup",
          testHint: "Open a chat transcript and confirm entity/skill chips and tool cards show labels, not raw @kind:, /skill:, or <tool_call>."
        ),
      ]
    default:
      return [
        WhatsNewItem(
          id: "review-version",
          title: "Review version \(version)",
          testHint: "Open What’s New for \(version) and walk each listed change on a signed-in chat session."
        ),
      ]
    }
  }
}

struct JovieWhatsNewView: View {
  let version: String
  let items: [WhatsNewItem]
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
        ForEach(items) { item in
          VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
            Text(item.title)
              .font(JovieFont.body(size: 16, weight: .semibold))
              .foregroundStyle(JovieColor.textPrimary)
            Text(item.testHint)
              .font(JovieFont.body(size: 15))
              .foregroundStyle(JovieColor.textSecondary)
          }
          .accessibilityElement(children: .combine)
          .accessibilityIdentifier("whats-new-item-\(item.id)")
        }
      }

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
    .presentationDetents([.medium, .large])
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
