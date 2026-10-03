import Observation
import SwiftUI


private struct ChatRepositoryContext: Equatable {
  let identity: NativeChatIdentity?
  let showsWorkspaceSwitch: Bool
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
  @State private var homeData: MobileHomeDataStore
  @State private var workspaceMode: MobileWorkspaceMode = .jovie
  @State private var showWhatsNew = false
  @State private var changelogWhatsNew: WhatsNewUnseen?
#if DEBUG
  @State private var didSendLiveChatProbe = false
#endif
  @AppStorage("jovie.whatsNew.lastPresentedVersion") private var lastPresentedWhatsNewVersion: String?
  @AppStorage(WhatsNewFeedPolicy.lastSeenStorageKey) private var lastSeenChangelogWhatsNewID: String?
  @Environment(\.scenePhase) private var scenePhase

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
    let homeData = MobileHomeDataStore()
    homeData.showFixture(
      audience: Self.previewAudienceHighlightsState(for: appState.launchMode),
      calendar: nil,
      inbox: nil
    )
    _homeData = State(initialValue: homeData)
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
          onEyesFreeSubmit: handleEyesFreeSubmit,
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
          onEyesFreeSubmit: handleEyesFreeSubmit,
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
            state: homeData.audienceState,
            isOffline: appState.isOffline,
            onRetry: { await reloadHomeData(for: appState.activeUserID) },
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
            response: homeData.calendar ?? (usesPreviewActionLoops ? .preview : nil),
            isLoading: homeData.isLoadingCalendar && homeData.calendar == nil,
            isOffline: appState.isOffline,
            onRetry: { await reloadHomeData(for: appState.activeUserID) },
            onAskJovie: askJovie
          )
        } inboxContent: { askJovie in
          InboxSurfaceView(
            response: homeData.inbox ?? (usesPreviewActionLoops && workspaceMode == .jovie ? .preview : nil),
            isLoading: homeData.isLoadingInbox && homeData.inbox == nil,
            isOffline: appState.isOffline,
            workspaceMode: workspaceMode,
            onRetry: { await reloadHomeData(for: appState.activeUserID) },
            onAskJovie: askJovie,
            onDecideSummerCard: decideSummerCard
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
    .sheet(item: $changelogWhatsNew) { unseen in
      JovieChangelogWhatsNewView(unseen: unseen)
    }
    // Launch and every return to the foreground: at most once per release.
    .task(id: "\(appState.route)-\(scenePhase)") {
      await checkChangelogWhatsNew()
    }
    .onChange(of: appState.activeUserID) {
      homeData.setContext(userID: appState.activeUserID, workspace: workspaceMode)
    }
    .onChange(of: appState.route) {
      if appState.route != .ready {
        homeData.setContext(userID: nil, workspace: workspaceMode)
      }
    }
    .task(id: "\(appState.route)-\(appState.launchMode)-\(appState.activeUserID ?? "")-\(workspaceMode.rawValue)") {
      guard appState.route == .ready else { return }
      // Live What’s New is the changelog sheet above. The versioned sheet is
      // the UITest fixture so chat-first cases can name what to tap.
      if appState.launchMode == .uiTestingWhatsNew {
        showWhatsNew = true
      }
      await reloadHomeData(for: appState.activeUserID)
    }
    .task(id: ChatRepositoryContext(identity: chatIdentity, showsWorkspaceSwitch: showsWorkspaceSwitch)) {
      // Ovie never persists across launches: the artist app cold-starts in
      // Jovie mode and admins opt in per session via Settings (JOV-5358).
      let resolved = MobileWorkspaceStore.load(isAdmin: showsWorkspaceSwitch)
      if workspaceMode != resolved {
        workspaceMode = resolved
        homeData.setContext(userID: appState.activeUserID, workspace: resolved)
      }

      guard let activeUserID = appState.activeUserID else {
        chatRepository = nil
        homeData.setContext(userID: nil, workspace: workspaceMode)
        return
      }

      if appState.launchMode == .uiTestingAuthCallback {
        chatRepository = nil
        homeData.showFixture(audience: .loaded(.preview), calendar: .preview, inbox: .preview)
        return
      }

      let identity = NativeChatIdentity(userID: activeUserID, ownership: appState.activeSessionOwnership,
                                        workspace: workspaceMode)
      if appState.launchMode.needsChatRepository, chatRepository?.identity != identity {
        let repository = ChatRepository.resolve(chatRepository, for: identity, create: makeChatRepository)
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
      guard chatRepository?.identity.ownership == nil, chatRepository?.sessionExpired == true else { return }
      await appState.handleExpiredSession()
    }
  }

  private var currentAppVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
  }

  private func markWhatsNewPresented() {
    lastPresentedWhatsNewVersion = currentAppVersion
  }

  private func checkChangelogWhatsNew() async {
    guard
      appState.launchMode == .live,
      appState.route == .ready,
      scenePhase == .active,
      changelogWhatsNew == nil,
      !showWhatsNew
    else { return }
    let client = WhatsNewFeedClient(webBaseURL: appState.configuration.webBaseURL)
    guard let feed = await client.fetch(), !Task.isCancelled else { return }
    guard let unseen = WhatsNewFeedPolicy.resolve(
      feed: feed,
      lastSeenID: lastSeenChangelogWhatsNewID
    ) else { return }
    // Seen on presentation: once per release even if the app dies mid-sheet.
    lastSeenChangelogWhatsNewID = unseen.entry.id
    changelogWhatsNew = unseen
  }

  private func handleAutoSendMessage(_ text: String) {
    Task { await chatRepository?.send(text: text) }
  }

  private func handleEyesFreeSubmit(_ launch: EyesFreeCaptureLaunch, _ transcript: String) {
    Task {
      let readback = await chatRepository?.submitEyesFreeCapture(
        transcript: transcript,
        destination: launch.destination,
        idempotencyKey: launch.idempotencyKey
      )
      if let readback, !readback.isEmpty {
        EyesFreeReadback.speak(readback)
      }
    }
  }

  private var showsWorkspaceSwitch: Bool {
    if appState.loadedDashboardResponse?.showsAdminWorkspaceSwitch == true {
      return true
    }
    #if DEBUG
      return ProcessInfo.processInfo.arguments.contains("-ui-testing-admin")
    #else
      return false
    #endif
  }

  private func selectWorkspace(_ mode: MobileWorkspaceMode) {
    guard showsWorkspaceSwitch else { return }
    MobileWorkspaceStore.save(mode, isAdmin: true)
    workspaceMode = mode
    homeData.setContext(userID: appState.activeUserID, workspace: mode)
  }

  private var chatIdentity: NativeChatIdentity? {
    appState.activeUserID.map {
      NativeChatIdentity(userID: $0, ownership: appState.activeSessionOwnership, workspace: workspaceMode)
    }
  }

  private func makeChatRepository(identity: NativeChatIdentity) -> ChatRepository {
    NativeChatRepositoryFactory.make(
      identity: identity,
      apiBaseURL: appState.configuration.apiBaseURL,
      webBaseURL: appState.configuration.webBaseURL,
      cache: ChatCache(),
      onSessionExpired: { [appState] receipt in await appState.handleExpiredSession(receipt) }
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
  private func reloadHomeData(for userID: String?) async {
    if appState.launchMode.holdsActionLoopLoading {
      homeData.showFixture(
        audience: Self.previewAudienceHighlightsState(for: appState.launchMode),
        calendar: nil,
        inbox: nil,
        isLoadingCalendar: appState.launchMode == .uiTestingCalendarLoading,
        isLoadingInbox: appState.launchMode == .uiTestingInboxLoading
      )
      return
    }
    if usesPreviewActionLoops {
      homeData.showFixture(
        audience: Self.previewAudienceHighlightsState(for: appState.launchMode),
        calendar: .preview,
        inbox: .preview
      )
      return
    }
    guard let userID, appState.route == .ready else {
      homeData.setContext(userID: nil, workspace: workspaceMode)
      return
    }
    await homeData.reload(
      userID: userID,
      workspace: workspaceMode,
      client: APIClient(
        baseURL: appState.configuration.apiBaseURL,
        tokenProvider: NativeSessionTokenProvider()
      )
    )
  }

  /// Posts a Summer card decision (final on the server; 409 counts as decided)
  /// and drops the item from the local inbox snapshot.
  @MainActor
  private func decideSummerCard(
    card: MobileSummerCard,
    decision: SummerCardDecision,
    comment: String?
  ) async -> Bool {
    guard let userID = appState.activeUserID else { return false }
    let workspace = workspaceMode
    let cardID = card.id
    let client = APIClient(
      baseURL: appState.configuration.apiBaseURL,
      tokenProvider: NativeSessionTokenProvider()
    )
    return await homeData.decideSummerCard(cardID, userID: userID, workspace: workspace) {
      _ = try await client.decideSummerCard(cardID: cardID, decision: decision, comment: comment)
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
          title: "Work, Calendar, and Inbox live in the sidebar",
          testHint: "Open the sidebar and tap Work, Calendar, Inbox, Profile, Audience, and Talk. None of these should be bottom tabs."
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

// MARK: - Remote What's New (changelog feed)

/// One release from `GET /changelog/whats-new.json` (contract version 1).
/// `CHANGELOG.md` on the web is the only source; the id is the release version.
struct WhatsNewFeedEntry: Decodable, Equatable, Sendable {
  let id: String
  let title: String
  let date: String
  let summary: String
  let url: URL
  let highlights: [String]
  let dogfood: [String]
}

struct WhatsNewFeed: Decodable, Equatable, Sendable {
  static let contractVersion = 1
  static let path = "changelog/whats-new.json"

  let version: Int
  let changelogUrl: URL
  let entries: [WhatsNewFeedEntry]
}

struct WhatsNewUnseen: Equatable, Identifiable, Sendable {
  let entry: WhatsNewFeedEntry
  let unseenCount: Int
  /// The post for one unseen release, the changelog index for several.
  let link: URL

  var id: String { entry.id }
}

enum WhatsNewFeedPolicy {
  static let lastSeenStorageKey = "jovie.whatsNew.lastSeenID"

  /// Mirrors `resolveUnseenWhatsNew` in apps/web/lib/whats-new.ts.
  /// No last-seen id (or one that aged out of the feed) counts only the
  /// newest release, so a first launch never reads as a backlog.
  static func resolve(feed: WhatsNewFeed, lastSeenID: String?) -> WhatsNewUnseen? {
    guard let newest = feed.entries.first, newest.id != lastSeenID else {
      return nil
    }
    let seenIndex = lastSeenID.flatMap { id in
      feed.entries.firstIndex { $0.id == id }
    } ?? 0
    let unseenCount = max(seenIndex, 1)
    return WhatsNewUnseen(
      entry: newest,
      unseenCount: unseenCount,
      link: unseenCount > 1 ? feed.changelogUrl : newest.url
    )
  }

  /// Decode an untrusted payload; any other contract version reads as "nothing new".
  static func decode(_ data: Data) -> WhatsNewFeed? {
    guard
      let feed = try? JSONDecoder().decode(WhatsNewFeed.self, from: data),
      feed.version == WhatsNewFeed.contractVersion
    else {
      return nil
    }
    return feed
  }
}

struct WhatsNewFeedClient: Sendable {
  let webBaseURL: URL
  var session: URLSession = URLSession(configuration: .jovieMobile)

  /// Returns nil on any network, status, or contract failure. The sheet stays silent.
  func fetch() async -> WhatsNewFeed? {
    var request = URLRequest(url: webBaseURL.appending(path: WhatsNewFeed.path))
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    guard
      let result = try? await session.data(for: request),
      let http = result.1 as? HTTPURLResponse,
      (200..<300).contains(http.statusCode)
    else {
      return nil
    }
    return WhatsNewFeedPolicy.decode(result.0)
  }
}

struct JovieChangelogWhatsNewView: View {
  let unseen: WhatsNewUnseen
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL

  private var linkTitle: String {
    unseen.unseenCount > 1 ? "See All Updates" : "Read the Post"
  }

  private var eyebrow: String {
    unseen.unseenCount > 1 ? "What’s New · \(unseen.unseenCount) updates" : "What’s New"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: JovieSpacing.large) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: JovieSpacing.xSmall) {
          Text(eyebrow)
            .font(JovieFont.body(size: 14))
            .foregroundStyle(JovieColor.textTertiary)
          Text(unseen.entry.title)
            .font(JovieFont.display(size: 24))
            .foregroundStyle(JovieColor.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
        }
        Spacer(minLength: JovieSpacing.medium)
        Image(systemName: "sparkles")
          .font(.title2)
          .foregroundStyle(JovieColor.accent)
          .accessibilityHidden(true)
      }

      ScrollView {
        VStack(alignment: .leading, spacing: JovieSpacing.medium) {
          Text(unseen.entry.summary)
            .font(JovieFont.body(size: 16))
            .foregroundStyle(JovieColor.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("whats-new-summary")

          if !unseen.entry.dogfood.isEmpty {
            VStack(alignment: .leading, spacing: JovieSpacing.small) {
              Text("Try This")
                .font(JovieFont.body(size: 14, weight: .semibold))
                .foregroundStyle(JovieColor.textPrimary)
                .accessibilityAddTraits(.isHeader)
              ForEach(Array(unseen.entry.dogfood.enumerated()), id: \.offset) { index, hint in
                Label {
                  Text(hint)
                    .font(JovieFont.body(size: 15))
                    .foregroundStyle(JovieColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                } icon: {
                  Image(systemName: "checkmark.circle")
                    .foregroundStyle(JovieColor.accent)
                    .accessibilityHidden(true)
                }
                .accessibilityIdentifier("whats-new-dogfood-\(index)")
              }
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }

      VStack(spacing: JovieSpacing.small) {
        Button(linkTitle) {
          openURL(unseen.link)
          dismiss()
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
        .accessibilityIdentifier("whats-new-read-post")

        Button("Got It") {
          dismiss()
        }
        .buttonStyle(JoviePillButtonStyle(filled: false))
        .accessibilityIdentifier("whats-new-got-it")
      }
    }
    .padding(JovieSpacing.large)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(JovieColor.backgroundBase)
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .accessibilityElement(children: .contain)
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
