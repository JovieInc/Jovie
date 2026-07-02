import SwiftUI

enum AppShellTab: Equatable, Hashable {
  case chat
  case profile
  case audience

  var accessibilityID: String {
    switch self {
    case .chat:
      return "shell-tab-chat"
    case .profile:
      return "shell-tab-profile"
    case .audience:
      return "shell-tab-audience"
    }
  }

  var title: String {
    switch self {
    case .chat:
      return "Chat"
    case .profile:
      return "Profile"
    case .audience:
      return "Audience"
    }
  }

  var systemImage: String {
    switch self {
    case .chat:
      return "sparkles"
    case .profile:
      return "qrcode.viewfinder"
    case .audience:
      return "person.3"
    }
  }

  var isBottomBarDestination: Bool {
    switch self {
    case .chat, .profile:
      return true
    case .audience:
      return false
    }
  }
}

// File-level so unit tests can call it without importing SwiftUI.
func resolveShellInitialTab(_ initialTab: AppShellTab, chatEnabled: Bool) -> AppShellTab {
  switch initialTab {
  case .chat:
    return chatEnabled ? .chat : .profile
  case .audience, .profile:
    return initialTab
  }
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

struct AppShellView<ProfileContent: View, AudienceContent: View, ChatContent: View>: View {
  let profile: AppShellProfile
  let isOffline: Bool
  let opensSettingsOnLaunch: Bool
  let billingURL: URL
  let chatEnabled: Bool
  let audienceEnabled: Bool
  let recentConversations: [MobileConversationSummary]
  let activeConversationID: String?
  let onSelectConversation: (String) -> Void
  let onStartNewChat: () -> Void
  let onAutoSendMessage: (String) -> Void
  let onTalk: () -> Void
  let onLogout: @MainActor () async -> Void
  @ViewBuilder let profileContent: ProfileContent
  @ViewBuilder let audienceContent: (_ askJovie: @escaping (String) -> Void) -> AudienceContent
  let chatContent: (Binding<String>) -> ChatContent

  @State private var selectedTab: AppShellTab
  @State private var navigationPath: [AppShellRoute] = []
  @State private var isShowingDrawer = false
  @State private var didOpenLaunchSettings = false
  @State private var chatDraft = ""
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
    activeConversationID: String? = nil,
    onSelectConversation: @escaping (String) -> Void = { _ in },
    onStartNewChat: @escaping () -> Void = {},
    onAutoSendMessage: @escaping (String) -> Void = { _ in },
    onTalk: @escaping () -> Void = {},
    onLogout: @escaping @MainActor () async -> Void,
    @ViewBuilder profileContent: () -> ProfileContent,
    @ViewBuilder audienceContent: @escaping (_ askJovie: @escaping (String) -> Void) -> AudienceContent,
    @ViewBuilder chatContent: @escaping (Binding<String>) -> ChatContent
  ) {
    self.profile = profile
    self.isOffline = isOffline
    self.opensSettingsOnLaunch = opensSettingsOnLaunch
    self.billingURL = billingURL
    self.chatEnabled = chatEnabled
    self.audienceEnabled = audienceEnabled
    self.recentConversations = recentConversations
    self.activeConversationID = activeConversationID
    self.onSelectConversation = onSelectConversation
    self.onStartNewChat = onStartNewChat
    self.onAutoSendMessage = onAutoSendMessage
    self.onTalk = onTalk
    self.onLogout = onLogout
    self.profileContent = profileContent()
    self.audienceContent = audienceContent
    self.chatContent = chatContent
    _selectedTab = State(
      initialValue: Self.resolvedInitialTab(initialTab: initialTab, chatEnabled: chatEnabled)
    )
  }

  var body: some View {
    NavigationStack(path: $navigationPath) {
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
        bottomBar
      }
      .simultaneousGesture(pageSwipe)
      .simultaneousGesture(edgeSwipeToOpenDrawer)
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
      .overlay {
        AppShellLeftDrawer(
          isPresented: $isShowingDrawer,
          profile: profile,
          isOffline: isOffline,
          chatEnabled: chatEnabled,
          audienceEnabled: audienceEnabled,
          selectedTab: selectedTab,
          recentConversations: recentConversations,
          activeConversationID: activeConversationID,
          onSelectTab: selectTab,
          onStartNewChat: startNewChat,
          onSelectConversation: { conversationID in
            onSelectConversation(conversationID)
            selectTab(.chat)
          },
          onOpenSettings: {
            navigationPath.append(.settings)
          }
        )
      }
    }
    .background(JovieColor.backgroundBase)
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
  }

  // Consume a navigation request raised by an App Intent (Siri / Shortcuts /
  // Spotlight). Chat-bound requests land on Profile when chat is unavailable.
  private func applyPendingIntentNavigation() {
    var state = AppShellIntentNavigationState(
      selectedTab: selectedTab,
      chatDraft: chatDraft,
      autoSendMessage: nil,
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

    if state.selectedTab != previousTab {
      withAnimation(.easeInOut(duration: 0.25)) {
        selectedTab = state.selectedTab
      }
    } else {
      selectedTab = state.selectedTab
    }
  }

  private func selectTab(_ tab: AppShellTab) {
    withAnimation(.easeInOut(duration: 0.25)) {
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

  static func resolvedInitialTab(
    initialTab: AppShellTab,
    chatEnabled: Bool
  ) -> AppShellTab {
    resolveShellInitialTab(initialTab, chatEnabled: chatEnabled)
  }

  private func openDrawer() {
    guard !isShowingDrawer else { return }
    isShowingDrawer = true
  }

  // Horizontally paged primary screens. The floating bottom bar drives the same
  // `selectedTab` selection so taps and the horizontal swipe gesture stay in sync,
  // and each screen keeps its own vertical scrolling (the swipe is recognized
  // simultaneously and only acts on a clearly-horizontal end gesture).
  @ViewBuilder
  private var pagedContent: some View {
    switch selectedTab {
    case .chat:
      if chatEnabled {
        chatContent($chatDraft)
      } else {
        profileContent
      }
    case .profile:
      profileContent
    case .audience:
      audienceContent(openAudienceChat)
    }
  }

  // Slide direction follows the destination: Chat enters from the trailing edge,
  // Profile from the leading edge, so the motion matches the swipe.
  private var pageTransition: AnyTransition {
    .asymmetric(
      insertion: .move(edge: pageInsertionEdge),
      removal: .move(edge: pageRemovalEdge)
    )
  }

  private var pageInsertionEdge: Edge {
    switch selectedTab {
    case .chat:
      return .trailing
    case .profile, .audience:
      return .leading
    }
  }

  private var pageRemovalEdge: Edge {
    switch selectedTab {
    case .chat:
      return .leading
    case .profile, .audience:
      return .trailing
    }
  }

  private var pageSwipe: some Gesture {
    DragGesture(minimumDistance: 24)
      .onEnded { value in
        guard !isShowingDrawer else { return }

        let horizontal = value.translation.width
        guard chatEnabled,
              abs(horizontal) > 60,
              abs(horizontal) > abs(value.translation.height) * 1.5,
              value.startLocation.x >= 28 || horizontal < 0
        else { return }

        withAnimation(.easeInOut(duration: 0.28)) {
          if horizontal < 0, selectedTab == .profile {
            selectedTab = .chat
          } else if horizontal > 0, selectedTab == .chat {
            selectedTab = .profile
          }
        }
      }
  }

  private var edgeSwipeToOpenDrawer: some Gesture {
    DragGesture(minimumDistance: 12, coordinateSpace: .global)
      .onEnded { value in
        guard !isShowingDrawer, !reduceMotion else { return }
        guard value.startLocation.x < 28 else { return }
        if value.translation.width > 72 || value.predictedEndTranslation.width > 120 {
          openDrawer()
        }
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

  // Floating, icon-only bottom bar: nav capsule centered, Talk FAB trailing.
  private var bottomBar: some View {
    HStack(spacing: 4) {
      navIcon(.profile)
      if chatEnabled {
        navIcon(.chat)
      }
    }
    .padding(6)
    .modifier(BottomBarSurface())
    .frame(maxWidth: .infinity)
    .overlay(alignment: .trailing) {
      if chatEnabled {
        talkFAB
          .padding(.trailing, JovieSpacing.large)
      }
    }
    .padding(.bottom, JovieSpacing.medium)
  }

  // Global Talk FAB — voice entry point (wired to voice feature in JOV-10378/2928).
  private var talkFAB: some View {
    Button(action: onTalk) {
      Image(systemName: "mic.fill")
        .font(.system(size: 20, weight: .semibold))
        .foregroundStyle(JovieColor.backgroundBase)
        .frame(width: 52, height: 52)
        .background(Color.white, in: Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Talk to Jovie")
    .accessibilityIdentifier("shell-talk-fab")
  }

  private func navIcon(_ tab: AppShellTab) -> some View {
    let isSelected = selectedTab == tab

    return Button {
      withAnimation(.easeInOut(duration: 0.25)) {
        selectedTab = tab
      }
    } label: {
      Image(systemName: tab.systemImage)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(isSelected ? JovieColor.textPrimary : JovieColor.textTertiary)
        .frame(width: 48, height: 40)
        .background(
          isSelected ? JovieColor.surface1 : Color.clear,
          in: RoundedRectangle(cornerRadius: 13, style: .continuous)
        )
        .contentShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(tab.title)
    .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    .accessibilityIdentifier(tab.accessibilityID)
  }
}

private struct BottomBarSurface: ViewModifier {
  func body(content: Content) -> some View {
    content.background {
      if #available(iOS 26.0, *) {
        Capsule(style: .continuous)
          .fill(JovieColor.surface1.opacity(0.4))
          .glassEffect(
            .regular.tint(JovieColor.surface1.opacity(0.4)),
            in: .rect(cornerRadius: 28)
          )
      } else {
        Capsule(style: .continuous)
          .fill(.ultraThinMaterial)
          .overlay {
            Capsule(style: .continuous)
              .stroke(JovieColor.borderDefault, lineWidth: 1)
          }
      }
    }
  }
}