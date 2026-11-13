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
  let authCoordinator: MobileAuthCoordinator
  let onLogout: @MainActor () async -> Void
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
    authCoordinator: MobileAuthCoordinator,
    onLogout: @escaping @MainActor () async -> Void
  ) {
    self.appState = appState
    self.isAuthAvailable = isAuthAvailable
    self.isSignInUnavailable = isSignInUnavailable
    self.authErrorMessage = authErrorMessage
    self.onLogout = onLogout
    self.authCoordinator = authCoordinator
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
         .uiTestingStorefrontIdentity,
         .uiTestingChat,
         .uiTestingChatEntityFixture,
         .uiTestingChatAllComponents,
         .uiTestingStorefrontChat,
         .uiTestingSettings,
         .uiTestingVenueMode,
         .uiTestingLibrary,
         .uiTestingStorefrontReleases,
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
    if launchMode == .uiTestingStorefrontReleases {
      return LibraryFeed.storefrontReleaseAssets
    }
    return launchMode.usesEmptyLibraryPreview ? [] : LibraryFeed.previewAssets
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
          errorMessage: authErrorMessage,
          authCoordinator: authCoordinator
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
            onComplete: { [userID = appState.activeUserID, owner = appState.activeSessionOwnership] displayName, username in
              if appState.launchMode == .uiTestingNeedsOnboardingUnauthorized {
                await appState.handleExpiredSession()
                return nil
              }

              if appState.launchMode == .uiTestingNeedsOnboarding {
                return "Profile completion is temporarily unavailable. Try again."
              }

              guard let userID, let owner else { return nil }
              return await appState.completeProfile(
                displayName: displayName, username: username, for: userID, ifOwnedBy: owner,
                using: APIClient(baseURL: appState.configuration.apiBaseURL,
                                 tokenProvider: NativeSessionTokenProvider())
              )
            }
          )
          .id(appState.activeSessionOwnership)
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
      // UI fixtures exercise the same changelog sheet as live presentation.
      if appState.launchMode == .uiTestingWhatsNew {
        changelogWhatsNew = WhatsNewUITestFixture.unseen()
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
          if appState.launchMode == .uiTestingStorefrontChat {
            MobileChatStorefrontFixture.primeMockupImages()
          }
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
         .uiTestingStorefrontIdentity,
         .uiTestingChat,
         .uiTestingChatOffline,
         .uiTestingChatEntityFixture,
         .uiTestingChatAllComponents,
         .uiTestingStorefrontChat,
         .uiTestingSettings,
         .uiTestingVenueMode,
         .uiTestingAuthCallback,
         .uiTestingLibrary,
         .uiTestingStorefrontReleases,
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
  let authCoordinator: MobileAuthCoordinator
  let onLogout: @MainActor () async -> Void

  var body: some View {
    ZStack {
      AppContentView(
        appState: appState,
        isAuthAvailable: isAuthAvailable,
        isSignInUnavailable: isSignInUnavailable,
        authErrorMessage: authErrorMessage,
        authCoordinator: authCoordinator,
        onLogout: onLogout
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

/// Layout constants for the production What's New sheet.
enum JovieWhatsNewLayout {
  /// XCUITest reports the label's layout box plus the pill style's vertical
  /// paddings; reserving 24pt in the label reports a 48pt touch target.
  static let reservedActionMinHeight: CGFloat = 24
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
      ScrollView {
        VStack(alignment: .leading, spacing: JovieSpacing.medium) {
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
              .foregroundStyle(JovieColor.textTertiary)
              .accessibilityHidden(true)
          }
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
                  Image(systemName: "circle.fill")
                    .font(.system(size: 5))
                    .foregroundStyle(JovieColor.textTertiary)
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
        Button {
          openURL(unseen.link)
          dismiss()
        } label: {
          Text(linkTitle)
            .frame(maxWidth: .infinity)
            .frame(minHeight: JovieWhatsNewLayout.reservedActionMinHeight)
        }
        .buttonStyle(JoviePillButtonStyle(filled: true))
        .accessibilityIdentifier("whats-new-read-post")
        Button {
          dismiss()
        } label: {
          Text("Got It")
            .frame(maxWidth: .infinity)
            .frame(minHeight: JovieWhatsNewLayout.reservedActionMinHeight)
        }
        .buttonStyle(JoviePillButtonStyle(filled: false))
        .accessibilityIdentifier("whats-new-got-it")
      }
      .layoutPriority(1)
    }
    .padding(JovieSpacing.large)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(JovieColor.backgroundBase)
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("whats-new-production-sheet")
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
