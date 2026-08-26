import AVKit
import SwiftUI

enum AppShellTab: Equatable, Hashable {
  case chat
  case library
  case calendar
  case inbox
  case profile
  case audience

  var accessibilityID: String {
    switch self {
    case .chat: return "shell-tab-chat"
    case .library: return "shell-tab-library"
    case .calendar: return "shell-tab-calendar"
    case .inbox: return "shell-tab-inbox"
    case .profile: return "shell-tab-profile"
    case .audience: return "shell-tab-audience"
    }
  }

  var title: String {
    switch self {
    case .chat: return "Chat"
    case .library: return "Library"
    case .calendar: return "Calendar"
    case .inbox: return "Inbox"
    case .profile: return "Profile"
    case .audience: return "Audience"
    }
  }

  var systemImage: String {
    switch self {
    case .chat: return "sparkles"
    case .library: return "square.stack"
    case .calendar: return "calendar"
    case .inbox: return "tray"
    case .profile: return "qrcode.viewfinder"
    case .audience: return "person.3"
    }
  }

  /// Bottom-bar destinations are unused. Every surface is sidebar or rail.
  var isPrimaryTab: Bool {
    false
  }
}

// File-level so unit tests can call it without importing SwiftUI.
func resolveShellInitialTab(_ initialTab: AppShellTab, chatEnabled: Bool) -> AppShellTab {
  switch initialTab {
  case .chat, .library, .calendar, .inbox:
    return chatEnabled ? initialTab : .profile
  case .audience, .profile:
    return initialTab
  }
}

// GH-12949: the recessed drawer base plane must be fully invisible while closed.
func appShellDrawerBasePlaneOpacity(
  isShowingDrawer: Bool,
  drawerDragOffset: CGFloat
) -> Double {
  (isShowingDrawer || drawerDragOffset != 0) ? 1 : 0
}

// File-level so unit tests can assert the shipped keep-mounted policy.
func appShellKeepsChatMountedAcrossTabs() -> Bool {
  true
}

// Chat stays in the tree for every tab when chat is enabled so
// MobileChatView.task does not re-run refreshConversations().
func appShellShowsChatUnderlay(selectedTab: AppShellTab, chatEnabled: Bool) -> Bool {
  guard chatEnabled, appShellKeepsChatMountedAcrossTabs() else { return false }
  switch selectedTab {
  case .chat, .library, .calendar, .inbox, .profile, .audience:
    return true
  }
}

func appShellRightRailOpacity(isShowing: Bool, dragOffset: CGFloat) -> Double {
  (isShowing || dragOffset != 0) ? 1 : 0
}

func appShellHomeSurface(chatEnabled: Bool) -> AppShellTab {
  AppShellPanePolicy.homeSurface(chatEnabled: chatEnabled)
}

private enum AppShellRoute: Hashable {
  case settings
}

struct AppShellProfile: Equatable {
  let displayName: String
  let username: String?
  let publicProfileURL: String?
  let qrPayload: String?
  let avatarURL: URL?

  init(response: MobileMeResponse?) {
    displayName = response?.displayName ?? response?.username ?? "Jovie"
    username = response?.username
    publicProfileURL = response?.publicProfileURL
    qrPayload = response?.qrPayload
    avatarURL = response?.avatarURL.flatMap(URL.init(string:))
  }

  var secondaryText: String {
    if let username, !username.isEmpty {
      return "@\(username)"
    }

    return publicProfileURL ?? "Profile setup pending"
  }
}

/// 4-layer chat-first shell (JOV-3632):
/// home content → tab bar → rails (drawer / entity sheet) → overlays (Talk).
struct AppShellView<
  ProfileContent: View,
  AudienceContent: View,
  LibraryContent: View,
  CalendarContent: View,
  InboxContent: View,
  ChatContent: View
>: View {
  let profile: AppShellProfile
  let isOffline: Bool
  let opensSettingsOnLaunch: Bool
  let webBaseURL: URL
  let accountURL: URL
  let billingURL: URL
  let chatEnabled: Bool
  let audienceEnabled: Bool
  let recentConversations: [MobileConversationSummary]
  let isLoadingConversations: Bool
  let activeConversationID: String?
  let onSelectConversation: (String) -> Void
  let onStartNewChat: () -> Void
  let onAutoSendMessage: (String) -> Void
  let onLogout: @MainActor () async -> Void
  let showsWorkspaceSwitch: Bool
  let workspaceMode: MobileWorkspaceMode
  let onSelectWorkspace: (MobileWorkspaceMode) -> Void
  @ViewBuilder let profileContent: ProfileContent
  @ViewBuilder let audienceContent: (_ askJovie: @escaping (String) -> Void) -> AudienceContent
  @ViewBuilder let libraryContent: (
    _ onSelectAsset: @escaping (LibraryAsset) -> Void,
    _ home: Binding<LibraryHome>
  ) -> LibraryContent
  @ViewBuilder let calendarContent: (_ askJovie: @escaping (String) -> Void) -> CalendarContent
  @ViewBuilder let inboxContent: (_ askJovie: @escaping (String) -> Void) -> InboxContent
  let chatContent: (
    Binding<String>,
    Binding<Int>,
    @escaping (EntityContextItem) -> Void,
    @escaping (MobileChatVideoProposalPayload) -> Void
  ) -> ChatContent

  @State private var selectedTab: AppShellTab
  @State private var navigationPath: [AppShellRoute] = []
  @State private var isShowingDrawer = false
  @State private var drawerDragOffset: CGFloat = 0
  @State private var isShowingRightRail = false
  @State private var railDragOffset: CGFloat = 0
  @State private var isKeyboardVisible = false
  @State private var didOpenLaunchSettings = false
  @State private var chatDraft = ""
  @State private var voiceCaptureTrigger = 0
  @State private var isShowingTalkOverlay = false
  @State private var talkVoiceService = VoiceCaptureService()
  @State private var teleprompterProposal: MobileChatVideoProposalPayload?
  @State private var libraryHome: LibraryHome = .catalog
  @State private var videoPlaybackAsset: LibraryAsset?
  @State private var publicProfileBrowserItem: PublicProfileBrowserDestination?
  @State private var isShowingProfileQR = false
  @State private var entityContext: EntityContextItem?
  @State private var lastEntityContext: EntityContextItem?
  @State private var intentStore = IntentNavigationStore.shared
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(
    profile: AppShellProfile,
    isOffline: Bool,
    initialTab: AppShellTab = .chat,
    opensSettingsOnLaunch: Bool = false,
    webBaseURL: URL,
    accountURL: URL,
    billingURL: URL,
    chatEnabled: Bool = false,
    audienceEnabled: Bool = true,
    recentConversations: [MobileConversationSummary] = [],
    isLoadingConversations: Bool = false,
    activeConversationID: String? = nil,
    onSelectConversation: @escaping (String) -> Void = { _ in },
    onStartNewChat: @escaping () -> Void = {},
    onAutoSendMessage: @escaping (String) -> Void = { _ in },
    onLogout: @escaping @MainActor () async -> Void,
    showsWorkspaceSwitch: Bool = false,
    workspaceMode: MobileWorkspaceMode = .jovie,
    onSelectWorkspace: @escaping (MobileWorkspaceMode) -> Void = { _ in },
    @ViewBuilder profileContent: () -> ProfileContent,
    @ViewBuilder audienceContent: @escaping (_ askJovie: @escaping (String) -> Void) -> AudienceContent,
    @ViewBuilder libraryContent: @escaping (
      _ onSelectAsset: @escaping (LibraryAsset) -> Void,
      _ home: Binding<LibraryHome>
    ) -> LibraryContent = { _, _ in EmptyView() },
    @ViewBuilder calendarContent: @escaping (_ askJovie: @escaping (String) -> Void) -> CalendarContent = { _ in
      EmptyView()
    },
    @ViewBuilder inboxContent: @escaping (_ askJovie: @escaping (String) -> Void) -> InboxContent = { _ in
      EmptyView()
    },
    @ViewBuilder chatContent: @escaping (
      Binding<String>,
      Binding<Int>,
      @escaping (EntityContextItem) -> Void,
      @escaping (MobileChatVideoProposalPayload) -> Void
    ) -> ChatContent
  ) {
    let opensTeleprompterFixture = ProcessInfo.processInfo.arguments.contains(
      "-ui-testing-teleprompter"
    )
    self.profile = profile
    self.isOffline = isOffline
    self.opensSettingsOnLaunch = opensSettingsOnLaunch
    self.webBaseURL = webBaseURL
    self.accountURL = accountURL
    self.billingURL = billingURL
    self.chatEnabled = chatEnabled
    self.audienceEnabled = audienceEnabled
    self.recentConversations = recentConversations
    self.isLoadingConversations = isLoadingConversations
    self.activeConversationID = activeConversationID
    self.onSelectConversation = onSelectConversation
    self.onStartNewChat = onStartNewChat
    self.onAutoSendMessage = onAutoSendMessage
    self.onLogout = onLogout
    self.showsWorkspaceSwitch = showsWorkspaceSwitch
    self.workspaceMode = workspaceMode
    self.onSelectWorkspace = onSelectWorkspace
    self.profileContent = profileContent()
    self.audienceContent = audienceContent
    self.libraryContent = libraryContent
    self.calendarContent = calendarContent
    self.inboxContent = inboxContent
    self.chatContent = chatContent
    _teleprompterProposal = State(
      initialValue: opensTeleprompterFixture
        ? MobileChatVideoProposalPayload(
          kind: .bts,
          title: "What changed the moment you stepped onto the ferry?",
          script: "Tell the story in your own words."
        )
        : nil
    )
    _selectedTab = State(
      initialValue: Self.resolvedInitialTab(initialTab: initialTab, chatEnabled: chatEnabled)
    )
  }

  var body: some View {
    NavigationStack(path: $navigationPath) {
      GeometryReader { proxy in
        let openOffset = drawerOpenOffset(safeAreaLeading: proxy.safeAreaInsets.leading)
        let isDrawerBasePlaneVisible = isShowingDrawer || drawerDragOffset != 0

        // Layer stack (bottom → top): drawer rail → home+tab bar → Talk overlay.
        ZStack(alignment: .leading) {
          AppShellLeftDrawer(
            isPresented: isShowingDrawer,
            profile: profile,
            chatEnabled: chatEnabled,
            audienceEnabled: audienceEnabled,
            selectedTab: selectedTab,
            recentConversations: recentConversations,
            isLoadingConversations: isLoadingConversations,
            activeConversationID: activeConversationID,
            drawerWidth: drawerWidth,
            onSelectTab: { tab in
              closeDrawerThenSelect(tab)
            },
            onStartNewChat: {
              closeDrawer()
              startNewChat()
            },
            onSelectConversation: { conversationID in
              closeDrawer()
              onSelectConversation(conversationID)
              selectTab(.chat)
            },
            onOpenSettings: {
              closeDrawer()
              navigationPath.append(.settings)
            },
            onTalk: {
              closeDrawer()
              openTalkOverlay()
            },
            onOpenPublicProfile: {
              openPublicProfile()
            },
            onOpenProfileQR: {
              openProfileQR()
            }
          )
          .opacity(
            appShellDrawerBasePlaneOpacity(
              isShowingDrawer: isShowingDrawer,
              drawerDragOffset: drawerDragOffset
            )
          )
          .animation(drawerAnimation, value: isShowingDrawer)
          .animation(reduceMotion ? nil : drawerAnimation, value: drawerDragOffset)
          .accessibilityHidden(!isDrawerBasePlaneVisible)

          shellContent
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .offset(
              x: reduceMotion
                ? 0
                : contentOffset(openOffset: openOffset, railOpenOffset: railWidth)
            )
            .opacity(reduceMotion && isShowingDrawer ? 0 : 1)
            .animation(drawerAnimation, value: isShowingDrawer)
            .animation(drawerAnimation, value: isShowingRightRail)
            .animation(reduceMotion ? nil : drawerAnimation, value: drawerDragOffset)
            .animation(reduceMotion ? nil : drawerAnimation, value: railDragOffset)

          AppShellRightRail(
            item: lastEntityContext,
            onTalk: openTalkOverlay,
            onEditInChat: { prompt in
              applyOpenPane(.none)
              chatDraft = prompt
              selectTab(.chat)
            },
            onClose: { applyOpenPane(.none) }
          )
          .frame(width: railWidth)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
          .offset(x: reduceMotion ? 0 : rightRailOffset(railOpenOffset: railWidth))
          .opacity(appShellRightRailOpacity(isShowing: isShowingRightRail, dragOffset: railDragOffset))
          .animation(drawerAnimation, value: isShowingRightRail)
          .accessibilityHidden(!isShowingRightRail && railDragOffset == 0)
          .allowsHitTesting(isShowingRightRail)

          if isShowingTalkOverlay, chatEnabled {
            TalkOverlayView(
              voiceCaptureService: talkVoiceService,
              onCancel: {
                isShowingTalkOverlay = false
              },
              onInsertDraft: { transcript in
                // Voice memo → editable action draft (not auto-send). User
                // reviews/edits in composer, then sends when ready (#10380).
                let handoff = VoiceMemoActionDraft.shellHandoff(fromTranscript: transcript)
                isShowingTalkOverlay = false
                selectTab(.chat)
                chatDraft = handoff.chatDraft
                // handoff.autoSendMessage is always nil — intentional.
              }
            )
            .transition(.opacity)
            .zIndex(10)
          }

          if let teleprompterProposal {
            TeleprompterOverlayView(
              viewModel: teleprompterViewModel(for: teleprompterProposal),
              onClose: {
                self.teleprompterProposal = nil
              }
            )
            .transition(.opacity)
            .zIndex(11)
          }
        }
        .simultaneousGesture(
          edgeRailGesture(
            openOffset: openOffset,
            containerWidth: proxy.size.width
          )
        )
      }
    }
    .background(JovieColor.backgroundBase)
    .sheet(item: $entityContext) { item in
      EntityContextSheet(
        item: item,
        onEditInChat: { prompt in
          entityContext = nil
          applyOpenPane(.none)
          chatDraft = prompt
          selectTab(.chat)
        },
        onDismiss: { entityContext = nil }
      )
    }
    .sheet(item: $videoPlaybackAsset) { asset in
      if let url = asset.localVideoURL {
        VideoPlayer(player: AVPlayer(url: url))
          .ignoresSafeArea()
          .background(Color.black)
          .accessibilityIdentifier("library-video-player")
      }
    }
    .fullScreenCover(item: $publicProfileBrowserItem) { destination in
      PublicProfileBrowserView(initialURL: destination.url, policy: destination.policy)
    }
    .fullScreenCover(isPresented: $isShowingProfileQR) {
      if let payload = profile.qrPayload {
        VenueModeView(
          qrPayload: payload,
          brightnessManager: ScreenBrightnessManager(),
          onDismiss: { isShowingProfileQR = false }
        )
      }
    }
    .task(id: opensSettingsOnLaunch) {
      guard opensSettingsOnLaunch, didOpenLaunchSettings == false else { return }
      didOpenLaunchSettings = true
      await Task.yield()
      navigationPath.append(.settings)
    }
    .task {
      applyPendingIntentNavigation()
    }
    .onChange(of: intentStore.pending) {
      applyPendingIntentNavigation()
    }
    .onContinueUserActivity(ConversationUserActivity.activityType) { activity in
      guard let payload = ConversationUserActivity.payload(from: activity.userInfo ?? [:]) else {
        return
      }
      intentStore.submit(.openConversation(payload.conversationID))
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
      isKeyboardVisible = true
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
      isKeyboardVisible = false
    }
    .onChange(of: voiceCaptureTrigger) {
      guard voiceCaptureTrigger > 0, chatEnabled else { return }
      openTalkOverlay()
    }
  }

  // Elevated content plane: toolbar + page + tab bar ride together so the
  // drawer transform reads as one spatial move.
  private var shellContent: some View {
    let isElevated = isShowingDrawer || drawerDragOffset != 0
      || isShowingRightRail || railDragOffset != 0

    return ZStack {
      ZStack {
        JovieColor.backgroundBase.ignoresSafeArea()

        pagedContent
          .transition(pageTransition)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .clipped()
      }
      .safeAreaInset(edge: .top, spacing: 0) {
        shellToolbar
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        if AppShellPanePolicy.showsBottomTabBar(), chatEnabled {
          AppShellTabBar(
            selectedTab: selectedTab,
            onSelect: { primary in
              selectTab(primary.shellTab)
            },
            onTalk: openTalkOverlay
          )
        }
      }
      .navigationBarHidden(true)
      .navigationDestination(for: AppShellRoute.self) { route in
        switch route {
        case .settings:
          SettingsView(
            profile: profile,
            buildInfo: .current(),
            accountURL: accountURL,
            billingURL: billingURL,
            onClose: { navigationPath.removeLast() },
            onLogout: onLogout,
            showsWorkspaceSwitch: showsWorkspaceSwitch,
            workspaceMode: workspaceMode,
            onSelectWorkspace: onSelectWorkspace
          )
          .navigationBarBackButtonHidden()
        }
      }
      .allowsHitTesting(!isElevated && !isShowingTalkOverlay && teleprompterProposal == nil)
      .accessibilityHidden(isElevated || isShowingTalkOverlay || teleprompterProposal != nil)

      if isElevated {
        Color.clear
          .contentShape(Rectangle())
          .onTapGesture { closeDrawer() }
          .accessibilityHidden(true)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(JovieColor.backgroundBase)
    .clipShape(shellContentClipShape(isElevated: isElevated))
    .background {
      if !isElevated {
        JovieColor.backgroundBase.ignoresSafeArea(edges: .bottom)
      }
    }
    .overlay(alignment: .leading) {
      if isElevated {
        Rectangle()
          .fill(JovieColor.borderSubtle)
          .frame(width: 1)
      }
    }
    .shadow(color: .black.opacity(isElevated ? 0.28 : 0), radius: 24, x: 8)
  }

  private func shellContentClipShape(isElevated: Bool) -> AnyShape {
    if isElevated {
      return AnyShape(RoundedRectangle(cornerRadius: JovieRadius.xLarge, style: .continuous))
    }
    return AnyShape(Rectangle())
  }

  private func applyPendingIntentNavigation() {
    var state = AppShellIntentNavigationState(
      selectedTab: selectedTab,
      chatDraft: chatDraft,
      autoSendMessage: nil,
      shouldStartVoiceCapture: false,
      openConversationID: nil,
      pendingRequest: intentStore.consume()
    )
    let previousTab = selectedTab

    guard AppShellIntentNavigation.applyPendingRequest(
      chatEnabled: chatEnabled,
      state: &state
    ) else { return }

    chatDraft = state.chatDraft

    if let autoSendMessage = state.autoSendMessage {
      onAutoSendMessage(autoSendMessage)
    }

    if let conversationID = state.openConversationID {
      onSelectConversation(conversationID)
    }

    if state.shouldStartVoiceCapture {
      voiceCaptureTrigger += 1
    }

    if state.shouldOpenSettings, navigationPath.last != .settings {
      navigationPath.append(.settings)
    }

    if state.selectedTab != previousTab {
      withAnimation(JovieMotion.easeOut(duration: JovieMotion.slowDuration)) {
        selectedTab = state.selectedTab
      }
    } else {
      selectedTab = state.selectedTab
    }
  }

  private func selectTab(_ tab: AppShellTab) {
    withAnimation(JovieMotion.easeOut(duration: JovieMotion.slowDuration)) {
      selectedTab = tab
    }
  }

  private func startNewChat() {
    onStartNewChat()
    chatDraft = ""
    selectTab(.chat)
  }

  private func openAudienceChat(prompt: String) {
    guard chatEnabled else { return }
    chatDraft = prompt
    selectTab(.chat)
  }

  private func openTalkOverlay() {
    guard chatEnabled else { return }
    dismissKeyboardIfNeeded()
    isShowingTalkOverlay = true
  }

  private func openPublicProfile() {
    dismissKeyboardIfNeeded()
    applyOpenPane(.none)
    guard
      let urlString = profile.publicProfileURL,
      let policy = PublicProfileURLPolicy(publicProfileURL: urlString),
      let url = policy.validatedURL(from: urlString)
    else { return }
    publicProfileBrowserItem = PublicProfileBrowserDestination(url: url, policy: policy)
  }

  private func openProfileQR() {
    dismissKeyboardIfNeeded()
    applyOpenPane(.none)
    guard profile.qrPayload != nil else { return }
    isShowingProfileQR = true
  }

  private func presentVideoProposal(_ proposal: MobileChatVideoProposalPayload) {
    guard chatEnabled else { return }
    dismissKeyboardIfNeeded()
    teleprompterProposal = proposal
  }

  private func openQuickVlogMode() {
    presentVideoProposal(.quickVlog)
  }

  private func presentEntity(_ item: EntityContextItem) {
    lastEntityContext = item
    entityContext = nil
    applyOpenPane(.rail)
  }

  /// The proposal's script auto-loads into the overlay; saving a recording
  /// dismisses the overlay and lands the user on Library (JOV-5075).
  private func teleprompterViewModel(
    for proposal: MobileChatVideoProposalPayload
  ) -> TeleprompterViewModel {
    let viewModel = TeleprompterViewModel(proposal: proposal)
    if ProcessInfo.processInfo.arguments.contains("-ui-testing-teleprompter") {
      viewModel.contentMode = .prompt
    }
    viewModel.onSaved = { _ in
      self.teleprompterProposal = nil
      self.libraryHome = LibraryLandingPolicy.homeAfterSavingVlog()
      self.selectTab(.library)
    }
    return viewModel
  }

  private func presentEntityFromLibrary(_ asset: LibraryAsset) {
    // Locally recorded teleprompter videos play back in place; every other
    // asset maps into the entity sheet for a shared context surface.
    if asset.type == .video, asset.localVideoURL != nil {
      videoPlaybackAsset = asset
      return
    }

    let kind: MobileChatEntityKind
    switch asset.type {
    case .release: kind = .release
    case .merch, .smartLink, .photo, .press, .video: kind = .track
    }
    presentEntity(
      EntityContextItem(kind: kind, entityID: asset.id, label: asset.name)
    )
  }

  static func resolvedInitialTab(
    initialTab: AppShellTab,
    chatEnabled: Bool
  ) -> AppShellTab {
    resolveShellInitialTab(initialTab, chatEnabled: chatEnabled)
  }

  private var drawerWidth: CGFloat {
    min(320, UIScreen.main.bounds.width * 0.86)
  }

  private var railWidth: CGFloat {
    min(320, UIScreen.main.bounds.width * 0.86)
  }

  private var drawerAnimation: Animation {
    reduceMotion ? JovieMotion.subtle : JovieMotion.cinematic
  }

  private func drawerOpenOffset(safeAreaLeading: CGFloat) -> CGFloat {
    drawerWidth + safeAreaLeading
  }

  private func contentOffset(openOffset: CGFloat, railOpenOffset: CGFloat) -> CGFloat {
    if isShowingDrawer {
      return max(0, openOffset + drawerDragOffset)
    }
    if isShowingRightRail {
      return min(0, -railOpenOffset + railDragOffset)
    }
    if railDragOffset != 0 {
      return min(0, railDragOffset)
    }
    return max(0, drawerDragOffset)
  }

  private func rightRailOffset(railOpenOffset: CGFloat) -> CGFloat {
    if isShowingRightRail {
      return min(0, railDragOffset)
    }
    return railOpenOffset + min(0, railDragOffset)
  }

  private func applyOpenPane(_ pane: AppShellOpenPane) {
    dismissKeyboardIfNeeded()
    switch pane {
    case .none:
      isShowingDrawer = false
      isShowingRightRail = false
      drawerDragOffset = 0
      railDragOffset = 0
    case .sidebar:
      isShowingRightRail = false
      railDragOffset = 0
      isShowingDrawer = true
      drawerDragOffset = 0
    case .rail:
      isShowingDrawer = false
      drawerDragOffset = 0
      isShowingRightRail = true
      railDragOffset = 0
    }
  }

  private func openDrawer() {
    guard !isShowingDrawer else { return }
    applyOpenPane(.sidebar)
  }

  private func closeDrawer() {
    applyOpenPane(.none)
  }

  private func closeDrawerThenSelect(_ tab: AppShellTab) {
    closeDrawer()
    DispatchQueue.main.asyncAfter(deadline: .now() + JovieMotion.cinematicDuration) {
      selectTab(tab)
    }
  }

  private func dismissKeyboardIfNeeded() {
    guard isKeyboardVisible else { return }
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder),
      to: nil,
      from: nil,
      for: nil
    )
  }

  @ViewBuilder
  private var pagedContent: some View {
    let showsChatUnderlay = appShellShowsChatUnderlay(
      selectedTab: selectedTab,
      chatEnabled: chatEnabled
    )
    let isChatSelected = selectedTab == .chat

    ZStack {
      if showsChatUnderlay {
        chatContent($chatDraft, $voiceCaptureTrigger, presentEntity, presentVideoProposal)
          .opacity(isChatSelected ? 1 : 0)
          .allowsHitTesting(isChatSelected)
          .accessibilityHidden(!isChatSelected)
      }

      if !isChatSelected || !chatEnabled {
        nonChatPagedContent
      }
    }
  }

  @ViewBuilder
  private var nonChatPagedContent: some View {
    switch selectedTab {
    case .chat:
      profileContent
    case .library:
      libraryContent(presentEntityFromLibrary, $libraryHome)
    case .calendar:
      calendarContent(openAudienceChat)
    case .inbox:
      inboxContent(openAudienceChat)
    case .profile:
      profileContent
    case .audience:
      audienceContent(openAudienceChat)
    }
  }

  private var pageTransition: AnyTransition {
    .opacity
  }

  /// Edge swipes own rails only (JOV-3635). No horizontal tab paging.
  private func edgeRailGesture(openOffset: CGFloat, containerWidth: CGFloat) -> some Gesture {
    DragGesture(minimumDistance: 8, coordinateSpace: .global)
      .onChanged { value in
        guard AppShellGesturePolicy.allowsEdgeRailDrag(
          reduceMotion: reduceMotion,
          isKeyboardVisible: isKeyboardVisible,
          isShowingTalkOverlay: isShowingTalkOverlay,
          hasTeleprompterProposal: teleprompterProposal != nil
        ) else { return }

        if isShowingDrawer {
          drawerDragOffset = min(0, value.translation.width)
        } else if isShowingRightRail {
          railDragOffset = max(0, value.translation.width)
        } else if value.startLocation.x < AppShellGesturePolicy.leftEdgeOpenWidth,
                  value.translation.width > 0
        {
          drawerDragOffset = min(value.translation.width, openOffset)
        } else if value.startLocation.x > containerWidth - AppShellGesturePolicy.rightEdgeOpenWidth,
                  value.translation.width < 0
        {
          railDragOffset = max(value.translation.width, -railWidth)
        }
      }
      .onEnded { value in
        guard AppShellGesturePolicy.allowsEdgeRailDrag(
          reduceMotion: reduceMotion,
          isKeyboardVisible: isKeyboardVisible,
          isShowingTalkOverlay: isShowingTalkOverlay,
          hasTeleprompterProposal: teleprompterProposal != nil
        ) else { return }

        let predicted = value.predictedEndTranslation.width
        if isShowingDrawer {
          if value.translation.width < -AppShellGesturePolicy.openDistance
            || predicted < -AppShellGesturePolicy.openPredicted
          {
            applyOpenPane(AppShellPanePolicy.paneAfterDismiss())
          } else {
            drawerDragOffset = 0
          }
          return
        }

        if isShowingRightRail {
          if AppShellGesturePolicy.isRightEdgeClose(
            isRailOpen: true,
            translationX: value.translation.width,
            predictedX: predicted
          ) {
            applyOpenPane(AppShellPanePolicy.paneAfterDismiss())
          } else {
            railDragOffset = 0
          }
          return
        }

        if AppShellGesturePolicy.isLeftEdgeOpen(
          startX: value.startLocation.x,
          translationX: value.translation.width,
          predictedX: predicted
        ) {
          applyOpenPane(AppShellPanePolicy.paneAfterLeadingSwipe(current: .none))
          return
        }

        if AppShellGesturePolicy.isRightEdgeOpen(
          startX: value.startLocation.x,
          containerWidth: containerWidth,
          translationX: value.translation.width,
          predictedX: predicted
        ) {
          applyOpenPane(AppShellPanePolicy.paneAfterTrailingSwipe(current: .none))
          return
        }
        drawerDragOffset = 0
        railDragOffset = 0
      }
  }

  private var shellToolbar: some View {
    HStack(alignment: .center, spacing: JovieSpacing.medium) {
      Button(action: openDrawer) {
        DashboardAvatarView(
          name: profile.displayName,
          avatarURL: profile.avatarURL
        )
        .frame(width: 32, height: 32)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Open navigation drawer")
      .accessibilityIdentifier("shell-drawer-open")

      VStack(alignment: .leading, spacing: 2) {
        Text(selectedTab.title)
          .font(JovieFont.display(size: 22))
          .foregroundStyle(JovieColor.textPrimary)
          .lineLimit(1)

        if isOffline {
          Text("Offline")
            .font(JovieFont.body(size: 11, weight: .medium))
            .foregroundStyle(JovieColor.textTertiary)
        }
      }

      Spacer(minLength: 0)

      if chatEnabled {
        Button(action: openQuickVlogMode) {
          Image(systemName: "video")
        }
        .buttonStyle(JovieIconButtonStyle())
        .accessibilityLabel("Open Vlog Mode")
        .accessibilityHint("Start a private on-device vlog in Prompt Mode")
        .accessibilityIdentifier("shell-vlog-open")

        Button(action: openTalkOverlay) {
          Image(systemName: "mic.fill")
        }
        .buttonStyle(JovieIconButtonStyle())
        .accessibilityLabel("Talk")
        .accessibilityIdentifier("shell-talk-fab")
        .accessibilityHint("Opens full-screen voice capture")
      }

      Button {
        navigationPath.append(.settings)
      } label: {
        Image(systemName: "gearshape")
      }
      .buttonStyle(JovieIconButtonStyle())
      .accessibilityLabel("Open Settings")
    }
    .padding(.horizontal, JovieSpacing.large)
    .padding(.vertical, JovieSpacing.small)
    .background(JovieColor.backgroundBase.opacity(0.96))
  }
}
