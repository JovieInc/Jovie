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

  /// Primary thumb-zone destinations (Audience + Profile are drawer-only).
  var isPrimaryTab: Bool {
    switch self {
    case .chat, .library, .calendar, .inbox:
      return true
    case .profile, .audience:
      return false
    }
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

private enum AppShellRoute: Hashable {
  case settings
}

struct AppShellProfile: Equatable {
  let displayName: String
  let username: String?
  let publicProfileURL: String?
  let avatarURL: URL?

  init(response: MobileMeResponse?) {
    displayName = response?.displayName ?? response?.username ?? "Jovie"
    username = response?.username
    publicProfileURL = response?.publicProfileURL
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
  @ViewBuilder let profileContent: ProfileContent
  @ViewBuilder let audienceContent: (_ askJovie: @escaping (String) -> Void) -> AudienceContent
  @ViewBuilder let libraryContent: (_ onSelectAsset: @escaping (LibraryAsset) -> Void) -> LibraryContent
  @ViewBuilder let calendarContent: (_ askJovie: @escaping (String) -> Void) -> CalendarContent
  @ViewBuilder let inboxContent: (_ askJovie: @escaping (String) -> Void) -> InboxContent
  let chatContent: (
    Binding<String>,
    Binding<Int>,
    @escaping (EntityContextItem) -> Void
  ) -> ChatContent

  @State private var selectedTab: AppShellTab
  @State private var navigationPath: [AppShellRoute] = []
  @State private var isShowingDrawer = false
  @State private var drawerDragOffset: CGFloat = 0
  @State private var isKeyboardVisible = false
  @State private var didOpenLaunchSettings = false
  @State private var chatDraft = ""
  @State private var voiceCaptureTrigger = 0
  @State private var isShowingTalkOverlay = false
  @State private var talkVoiceService = VoiceCaptureService()
  @State private var entityContext: EntityContextItem?
  @State private var lastEntityContext: EntityContextItem?
  @State private var intentStore = IntentNavigationStore.shared
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(
    profile: AppShellProfile,
    isOffline: Bool,
    initialTab: AppShellTab = .chat,
    opensSettingsOnLaunch: Bool = false,
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
    @ViewBuilder profileContent: () -> ProfileContent,
    @ViewBuilder audienceContent: @escaping (_ askJovie: @escaping (String) -> Void) -> AudienceContent,
    @ViewBuilder libraryContent: @escaping (_ onSelectAsset: @escaping (LibraryAsset) -> Void)
      -> LibraryContent = { _ in EmptyView() },
    @ViewBuilder calendarContent: @escaping (_ askJovie: @escaping (String) -> Void) -> CalendarContent = { _ in
      EmptyView()
    },
    @ViewBuilder inboxContent: @escaping (_ askJovie: @escaping (String) -> Void) -> InboxContent = { _ in
      EmptyView()
    },
    @ViewBuilder chatContent: @escaping (
      Binding<String>,
      Binding<Int>,
      @escaping (EntityContextItem) -> Void
    ) -> ChatContent
  ) {
    self.profile = profile
    self.isOffline = isOffline
    self.opensSettingsOnLaunch = opensSettingsOnLaunch
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
    self.profileContent = profileContent()
    self.audienceContent = audienceContent
    self.libraryContent = libraryContent
    self.calendarContent = calendarContent
    self.inboxContent = inboxContent
    self.chatContent = chatContent
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
            .offset(x: reduceMotion ? 0 : contentOffset(openOffset: openOffset))
            .opacity(reduceMotion && isShowingDrawer ? 0 : 1)
            .animation(drawerAnimation, value: isShowingDrawer)
            .animation(reduceMotion ? nil : drawerAnimation, value: drawerDragOffset)

          if isShowingTalkOverlay, chatEnabled {
            TalkOverlayView(
              voiceCaptureService: talkVoiceService,
              onCancel: {
                isShowingTalkOverlay = false
              },
              onSend: { transcript in
                isShowingTalkOverlay = false
                selectTab(.chat)
                onAutoSendMessage(transcript)
              }
            )
            .transition(.opacity)
            .zIndex(10)
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
          chatDraft = prompt
          selectTab(.chat)
        },
        onDismiss: { entityContext = nil }
      )
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

    return ZStack {
      ZStack {
        JovieColor.backgroundBase.ignoresSafeArea()

        pagedContent
          .id(selectedTab)
          .transition(pageTransition)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .clipped()
      }
      .safeAreaInset(edge: .top, spacing: 0) {
        shellToolbar
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        if chatEnabled {
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
            billingURL: billingURL,
            onClose: { navigationPath.removeLast() },
            onLogout: onLogout
          )
          .navigationBarBackButtonHidden()
        }
      }
      .allowsHitTesting(!isElevated && !isShowingTalkOverlay)
      .accessibilityHidden(isElevated || isShowingTalkOverlay)

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

  private func presentEntity(_ item: EntityContextItem) {
    lastEntityContext = item
    entityContext = item
  }

  private func presentEntityFromLibrary(_ asset: LibraryAsset) {
    // Map library assets into the entity sheet for a shared context surface.
    let kind: MobileChatEntityKind
    switch asset.type {
    case .release: kind = .release
    case .merch, .smartLink, .photo, .press: kind = .track
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

  private var drawerAnimation: Animation {
    reduceMotion ? JovieMotion.subtle : JovieMotion.cinematic
  }

  private func drawerOpenOffset(safeAreaLeading: CGFloat) -> CGFloat {
    drawerWidth + safeAreaLeading
  }

  private func contentOffset(openOffset: CGFloat) -> CGFloat {
    if isShowingDrawer {
      return max(0, openOffset + drawerDragOffset)
    }
    return max(0, drawerDragOffset)
  }

  private func openDrawer() {
    guard !isShowingDrawer else { return }
    dismissKeyboardIfNeeded()
    isShowingDrawer = true
  }

  private func closeDrawer() {
    drawerDragOffset = 0
    isShowingDrawer = false
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
    switch selectedTab {
    case .chat:
      if chatEnabled {
        chatContent($chatDraft, $voiceCaptureTrigger, presentEntity)
      } else {
        profileContent
      }
    case .library:
      libraryContent(presentEntityFromLibrary)
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
        guard !reduceMotion, !isKeyboardVisible, !isShowingTalkOverlay else { return }

        if isShowingDrawer {
          drawerDragOffset = min(0, value.translation.width)
        } else if value.startLocation.x < AppShellGesturePolicy.leftEdgeOpenWidth,
                  value.translation.width > 0
        {
          drawerDragOffset = min(value.translation.width, openOffset)
        }
      }
      .onEnded { value in
        guard !reduceMotion, !isKeyboardVisible, !isShowingTalkOverlay else { return }

        let predicted = value.predictedEndTranslation.width
        if isShowingDrawer {
          if value.translation.width < -AppShellGesturePolicy.openDistance
            || predicted < -AppShellGesturePolicy.openPredicted
          {
            closeDrawer()
          } else {
            drawerDragOffset = 0
          }
          return
        }

        if AppShellGesturePolicy.isLeftEdgeOpen(
          startX: value.startLocation.x,
          translationX: value.translation.width,
          predictedX: predicted
        ) {
          openDrawer()
          drawerDragOffset = 0
          return
        }

        if AppShellGesturePolicy.isRightEdgeOpen(
          startX: value.startLocation.x,
          containerWidth: containerWidth,
          translationX: value.translation.width,
          predictedX: predicted
        ), let lastEntityContext {
          presentEntity(lastEntityContext)
        }
        drawerDragOffset = 0
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
